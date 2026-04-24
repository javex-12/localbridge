use serde::{Serialize, Deserialize};
use std::sync::Mutex;
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum TransferStatus {
    Queued,
    Transferring,
    Paused,
    Done,
    Failed,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransferProgress {
    pub id: String,
    pub filename: String,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub speed_mbps: f64,
    pub status: TransferStatus,
}

// Again, using OnceLock for global state
use std::sync::OnceLock;

static TRANSFER_STATE: OnceLock<Mutex<HashMap<String, TransferProgress>>> = OnceLock::new();

fn get_transfer_state() -> &'static Mutex<HashMap<String, TransferProgress>> {
    TRANSFER_STATE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn create_transfer(filename: String, total_bytes: u64) -> String {
    let id = Uuid::new_v4().to_string();
    let mut state = get_transfer_state().lock().unwrap();
    state.insert(id.clone(), TransferProgress {
        id: id.clone(),
        filename,
        total_bytes,
        transferred_bytes: 0,
        speed_mbps: 0.0,
        status: TransferStatus::Queued,
    });
    id
}

pub fn update_progress(id: &str, transferred: u64, speed: f64) {
    let mut state = get_transfer_state().lock().unwrap();
    if let Some(progress) = state.get_mut(id) {
        progress.transferred_bytes = transferred;
        progress.speed_mbps = speed;
        progress.status = TransferStatus::Transferring;
        if progress.transferred_bytes >= progress.total_bytes {
            progress.status = TransferStatus::Done;
        }
    }
}

pub fn mark_done(id: &str) {
    let mut state = get_transfer_state().lock().unwrap();
    if let Some(progress) = state.get_mut(id) {
        progress.status = TransferStatus::Done;
        progress.transferred_bytes = progress.total_bytes;
    }
}

pub fn mark_failed(id: &str) {
    let mut state = get_transfer_state().lock().unwrap();
    if let Some(progress) = state.get_mut(id) {
        progress.status = TransferStatus::Failed;
    }
}

pub fn get_all_transfers() -> Vec<TransferProgress> {
    let state = get_transfer_state().lock().unwrap();
    state.values().cloned().collect()
}
