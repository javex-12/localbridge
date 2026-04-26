use std::sync::{Mutex, OnceLock};
use uuid::Uuid;
use rand::Rng;

static SESSION_TOKEN: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static PAIRING_CODE: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn get_session_token() -> &'static Mutex<Option<String>> {
    SESSION_TOKEN.get_or_init(|| Mutex::new(None))
}

fn get_pairing_code() -> &'static Mutex<Option<String>> {
    PAIRING_CODE.get_or_init(|| Mutex::new(None))
}

pub fn generate_token() -> String {
    let token = Uuid::new_v4().to_string().replace("-", "");
    let mut session = get_session_token().lock().unwrap();
    *session = Some(token.clone());
    
    // Generate a 6-digit pairing code
    let mut rng = rand::thread_rng();
    let code = format!("{:06}", rng.gen_range(0..1000000));
    let mut p_code = get_pairing_code().lock().unwrap();
    *p_code = Some(code);
    
    token
}

pub fn validate_token(token: &str) -> bool {
    let session = get_session_token().lock().unwrap();
    match &*session {
        Some(t) => t == token,
        None => false,
    }
}

pub fn validate_pairing_code(code: &str) -> Option<String> {
    let p_code = get_pairing_code().lock().unwrap();
    let session = get_session_token().lock().unwrap();
    
    match (&*p_code, &*session) {
        (Some(c), Some(t)) if c == code => Some(t.clone()),
        _ => None,
    }
}

pub fn get_token() -> Option<String> {
    get_session_token().lock().unwrap().clone()
}

pub fn get_pairing_code_value() -> Option<String> {
    get_pairing_code().lock().unwrap().clone()
}
