use qrcode::QrCode;
use qrcode::render::svg;
use serde::{Serialize, Deserialize};
use crate::network::detect_network;
// use crate::auth::generate_token;

#[derive(Debug, Serialize, Deserialize)]
pub struct QRPayload {
    pub ip: String,
    pub port: u16,
    pub token: String,
    pub pairing_code: String,
    pub ssid: Option<String>,
    pub password: Option<String>,
    pub svg: String,
}

pub fn generate_qr_payload(port: u16) -> QRPayload {
    let network = detect_network();
    let token = crate::auth::get_token().unwrap_or_else(|| crate::auth::generate_token());
    let pairing_code = crate::auth::get_pairing_code_value().unwrap_or_default();
    
    let json_payload = serde_json::json!({
        "ip": network.ip,
        "port": port,
        "token": token,
        "pairing_code": pairing_code,
        "ssid": network.ssid,
        "password": network.password,
    });

    let code = QrCode::new(json_payload.to_string().as_bytes()).unwrap();
    let svg_image = code.render::<svg::Color>()
        .light_color(svg::Color("#ffffff"))
        .dark_color(svg::Color("#000000"))
        .build();

    QRPayload {
        ip: network.ip,
        port,
        token,
        pairing_code,
        ssid: network.ssid,
        password: network.password,
        svg: svg_image,
    }
}
