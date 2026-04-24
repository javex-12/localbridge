use serde::{Serialize, Deserialize};
use std::process::Command;
use local_ip_address::local_ip;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkStatus {
    pub mode: String, // "wifi" or "hotspot"
    pub ip: String,
    pub ssid: Option<String>,
    pub password: Option<String>,
}

pub fn detect_network() -> NetworkStatus {
    match local_ip() {
        Ok(ip) => {
            NetworkStatus {
                mode: "wifi".to_string(),
                ip: ip.to_string(),
                ssid: None,
                password: None,
            }
        }
        Err(_) => {
            // No network found, try to create hotspot
            match create_hotspot() {
                Ok(info) => info,
                Err(_) => {
                    // Fallback to localhost if even hotspot fails
                    NetworkStatus {
                        mode: "local".to_string(),
                        ip: "127.0.0.1".to_string(),
                        ssid: None,
                        password: None,
                    }
                }
            }
        }
    }
}

pub fn create_hotspot() -> Result<NetworkStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let ssid = format!("LocalBridge_{}", &uuid::Uuid::new_v4().to_string()[..4]);
        let password = format!("lb{}", &uuid::Uuid::new_v4().to_string()[..6]);

        // netsh wlan set hostednetwork mode=allow ssid="LocalBridge" key="password"
        let status = Command::new("netsh")
            .args(&[
                "wlan",
                "set",
                "hostednetwork",
                "mode=allow",
                &format!("ssid={}", ssid),
                &format!("key={}", password),
            ])
            .status()
            .map_err(|e| e.to_string())?;

        if !status.success() {
            return Err("Failed to set hosted network".to_string());
        }

        let start_status = Command::new("netsh")
            .args(&["wlan", "start", "hostednetwork"])
            .status()
            .map_err(|e| e.to_string())?;

        if !start_status.success() {
            // Some modern Windows versions don't support hostednetwork anymore, 
            // they use "Mobile Hotspot" which is harder to control via CMD.
            // But we'll try this first.
            return Err("Failed to start hosted network".to_string());
        }

        Ok(NetworkStatus {
            mode: "hotspot".to_string(),
            ip: "192.168.137.1".to_string(), // Default Windows hotspot IP
            ssid: Some(ssid),
            password: Some(password),
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Hotspot creation not implemented for this OS yet".to_string())
    }
}
