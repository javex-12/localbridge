use std::sync::{Mutex, OnceLock};
use uuid::Uuid;

static SESSION_TOKEN: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn get_session_token() -> &'static Mutex<Option<String>> {
    SESSION_TOKEN.get_or_init(|| Mutex::new(None))
}

pub fn generate_token() -> String {
    let token = Uuid::new_v4().to_string().replace("-", "");
    let mut session = get_session_token().lock().unwrap();
    *session = Some(token.clone());
    token
}

pub fn validate_token(token: &str) -> bool {
    let session = get_session_token().lock().unwrap();
    match &*session {
        Some(t) => t == token,
        None => false,
    }
}

pub fn get_token() -> Option<String> {
    get_session_token().lock().unwrap().clone()
}
