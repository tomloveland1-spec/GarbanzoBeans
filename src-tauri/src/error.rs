use std::fmt;

#[derive(Debug, serde::Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError {
            code: "DB_ERROR".to_string(),
            message: e.to_string(),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError {
            code: "IO_ERROR".to_string(),
            message: e.to_string(),
        }
    }
}
