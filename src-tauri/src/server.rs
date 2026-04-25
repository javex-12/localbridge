use axum::{
    extract::{Query, State, ws::{WebSocket, WebSocketUpgrade, Message}},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
    Json,
    body::Body,
};
use axum::extract::DefaultBodyLimit;
use tower_http::cors::{Any, CorsLayer};
use serde::Deserialize;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tauri::AppHandle;
use tauri::Emitter;
use std::path::PathBuf;
use tokio::fs::File;
use tokio_util::io::ReaderStream;
use futures::{StreamExt, TryStreamExt};

use crate::auth::validate_token;
use crate::files::{list_directory, generate_thumbnail};
use crate::qr::generate_qr_payload;
use crate::transfer::{update_progress, create_transfer, mark_done, mark_failed};

#[derive(Clone)]
struct AppState {
    app_handle: AppHandle,
    tx: broadcast::Sender<String>,
}

#[derive(Deserialize)]
struct AuthQuery {
    token: String,
}

#[derive(Deserialize)]
struct PathQuery {
    path: String,
    token: String,
}

pub async fn start_server(app_handle: AppHandle, port: u16) {
    let (tx, _rx) = broadcast::channel(100);
    let state = Arc::new(AppState {
        app_handle,
        tx,
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/qr", get(get_qr))
        .route("/api/files", get(get_files))
        .route("/api/file", get(download_file))
        .route("/api/thumbnail", get(get_thumb))
        .route("/api/upload", post(upload_file))
        .route("/ws", get(ws_handler))
        .layer(cors)
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024 * 1024)) // 10GB limit
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn get_qr() -> impl IntoResponse {
    let payload = generate_qr_payload(3000); // Fixed port for now or pass it
    Json(payload)
}

async fn get_files(Query(query): Query<PathQuery>) -> impl IntoResponse {
    if !validate_token(&query.token) {
        return (StatusCode::UNAUTHORIZED, "Invalid token").into_response();
    }

    match list_directory(&query.path) {
        Ok(files) => Json(files).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

async fn get_thumb(Query(query): Query<PathQuery>) -> impl IntoResponse {
    if !validate_token(&query.token) {
        return (StatusCode::UNAUTHORIZED, "Invalid token").into_response();
    }

    match generate_thumbnail(&query.path) {
        Some(base64) => Json(serde_json::json!({ "thumbnail": base64 })).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn download_file(Query(query): Query<PathQuery>) -> impl IntoResponse {
    if !validate_token(&query.token) {
        return (StatusCode::UNAUTHORIZED, "Invalid token").into_response();
    }

    let path = PathBuf::from(&query.path);
    let file = match File::open(&path).await {
        Ok(file) => file,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };

    let metadata = file.metadata().await.unwrap();
    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Response::builder()
        .header("Content-Disposition", format!("attachment; filename=\"{}\"", path.file_name().unwrap().to_string_lossy()))
        .header("Content-Length", metadata.len())
        .header("Content-Type", "application/octet-stream")
        .body(body)
        .unwrap()
}

async fn upload_file(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PathQuery>,
    mut multipart: axum::extract::Multipart,
) -> impl IntoResponse {
    if !validate_token(&query.token) {
        return (StatusCode::UNAUTHORIZED, "Invalid token").into_response();
    }

    while let Ok(Some(field)) = multipart.next_field().await {
        let file_name = field.file_name().unwrap_or("uploaded_file").to_string();
        let mut dest_path = PathBuf::from(&query.path);
        dest_path.push(&file_name);

        let transfer_id = create_transfer(file_name.clone(), 0); // Size unknown yet or get from header
        
        let mut file = match File::create(&dest_path).await {
            Ok(file) => file,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };

        let mut stream = field.into_stream();
        let mut transferred = 0;

        while let Some(chunk) = stream.next().await {
            if let Ok(bytes) = chunk {
                if let Err(e) = tokio::io::copy(&mut &bytes[..], &mut file).await {
                     mark_failed(&transfer_id);
                     return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
                }
                transferred += bytes.len() as u64;
                update_progress(&transfer_id, transferred, 0.0);
                
                // Emit to laptop UI
                let _ = state.app_handle.emit("transfer-progress", serde_json::json!({
                    "id": transfer_id,
                    "filename": file_name.clone(),
                    "transferred": transferred,
                    "status": "transferring",
                }));
            }
        }
        mark_done(&transfer_id);
        let _ = state.app_handle.emit("transfer-progress", serde_json::json!({
            "id": transfer_id,
            "filename": file_name,
            "transferred": transferred,
            "status": "done",
        }));
    }

    StatusCode::OK.into_response()
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<AuthQuery>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    if !validate_token(&query.token) {
        return (StatusCode::UNAUTHORIZED, "Invalid token").into_response();
    }

    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.tx.subscribe();

    loop {
        tokio::select! {
            msg = socket.recv() => {
                if let Some(Ok(Message::Text(text))) = msg {
                    // Handle client messages if needed
                    println!("Received WS message: {}", text);
                } else {
                    break;
                }
            }
            Ok(msg) = rx.recv() => {
                if socket.send(Message::Text(msg)).await.is_err() {
                    break;
                }
            }
        }
    }
}
