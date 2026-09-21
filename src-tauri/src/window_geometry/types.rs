use serde::{Deserialize, Serialize};

pub(super) const WINDOW_GEOMETRY_STORE_VERSION: u32 = 2;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub(super) struct WindowGeometryRecord {
    pub(super) version: u32,
    pub(super) width: f64,
    pub(super) height: f64,
    pub(super) x: f64,
    pub(super) y: f64,
    pub(super) previous_x: f64,
    pub(super) previous_y: f64,
    pub(super) maximized: bool,
    pub(super) fullscreen: bool,
}
