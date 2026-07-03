use serde::{Deserialize, Serialize};

pub const WINDOW_GEOMETRY_STORE_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct WindowGeometryRecord {
    pub version: u32,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    #[serde(default)]
    pub maximized: bool,
}
