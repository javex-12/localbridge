// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod network;
mod auth;
mod qr;
mod files;
mod transfer;
mod server;

use crate::server::start_server;
use crate::qr::{generate_qr_payload, QRPayload};
use crate::files::{list_directory, FileEntry, search_files};
use crate::network::{detect_network, NetworkStatus};

#[tauri::command]
async fn get_connection_info() -> QRPayload {
    generate_qr_payload(3000)
}

#[tauri::command]
fn get_network_status() -> NetworkStatus {
    detect_network()
}

#[tauri::command]
fn list_files(path: String) -> Result<Vec<FileEntry>, String> {
    list_directory(&path)
}

#[tauri::command]
fn search(query: String, root: String) -> Vec<FileEntry> {
    search_files(&query, &root)
}

#[tauri::command]
fn get_home_dir() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                start_server(handle, 3000).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_connection_info,
            get_network_status,
            list_files,
            search,
            get_home_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}