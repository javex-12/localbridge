use serde::{Serialize, Deserialize};
use std::fs;
use std::path::Path;
use std::io::Cursor;
use base64::{Engine as _, engine::general_purpose};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub kind: String, // "file", "folder", "image", "video", "audio", "document", "archive", "other"
    pub size: u64,
    pub modified: String,
    pub thumbnail: Option<String>,
}

pub fn get_kind(path: &Path) -> String {
    if path.is_dir() {
        return "folder".to_string();
    }
    
    let ext = path.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
        
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "bmp" => "image".to_string(),
        "mp4" | "mkv" | "avi" | "mov" | "webm" => "video".to_string(),
        "mp3" | "wav" | "ogg" | "flac" | "m4a" => "audio".to_string(),
        "pdf" | "doc" | "docx" | "txt" => "document".to_string(),
        "zip" | "rar" | "7z" | "tar" | "gz" => "archive".to_string(),
        _ => "other".to_string(),
    }
}

pub fn list_directory(dir_path: &str) -> Result<Vec<FileEntry>, String> {
    if dir_path == "/" || dir_path.is_empty() {
        #[cfg(target_os = "windows")]
        {
            let mut drives = Vec::new();
            for letter in b'A'..=b'Z' {
                let drive = format!("{}:\\", letter as char);
                if Path::new(&drive).exists() {
                    drives.push(FileEntry {
                        name: drive.clone(),
                        path: drive,
                        kind: "folder".to_string(),
                        size: 0,
                        modified: "".to_string(),
                        thumbnail: None,
                    });
                }
            }
            return Ok(drives);
        }
    }

    let path = Path::new(dir_path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }
    
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    
    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
            let name = path.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string();
                
            let kind = get_kind(&path);
            let modified = metadata.modified()
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
                .unwrap_or_default();

            result.push(FileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                kind,
                size: metadata.len(),
                modified,
                thumbnail: None, // Generated on demand or lazy
            });
        }
    }
    
    Ok(result)
}

pub fn generate_thumbnail(path_str: &str) -> Option<String> {
    let path = Path::new(path_str);
    let kind = get_kind(path);
    
    if kind != "image" {
        return None;
    }
    
    let img = image::open(path).ok()?;
    let thumb = img.thumbnail(200, 200);
    
    let mut buf = Cursor::new(Vec::new());
    thumb.write_to(&mut buf, image::ImageFormat::Jpeg).ok()?;
    
    Some(general_purpose::STANDARD.encode(buf.into_inner()))
}

pub fn search_files(query: &str, root: &str) -> Vec<FileEntry> {
    // Simple non-recursive search for now to keep it fast
    let entries = list_directory(root).unwrap_or_default();
    let query = query.to_lowercase();
    
    entries.into_iter()
        .filter(|e| e.name.to_lowercase().contains(&query))
        .collect()
}
