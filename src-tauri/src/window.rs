#[cfg(target_os = "macos")]
use tauri::LogicalPosition;
use tauri::{App, AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

// The offset from the top of the screen to the window
const TOP_OFFSET: i32 = 54;

/// Sets up the main window with custom positioning
pub fn setup_main_window(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // Try different possible window labels
    let window = app
        .get_webview_window("main")
        .or_else(|| app.get_webview_window("salesly"))
        .or_else(|| {
            // Get the first window if specific labels don't work
            app.webview_windows().values().next().cloned()
        })
        .ok_or("No window found")?;

    position_window_top_center(&window, TOP_OFFSET)?;

    // Set window as non-focusable on Windows
    // #[cfg(target_os = "windows")]
    // {
    //     let _ = window.set_focusable(false);
    // }

    Ok(())
}

/// Positions a window at the top center of the screen with a specified Y offset
pub fn position_window_top_center(
    window: &WebviewWindow,
    y_offset: i32,
) -> Result<(), Box<dyn std::error::Error>> {
    // Get the primary monitor
    if let Some(monitor) = window.primary_monitor()? {
        let monitor_size = monitor.size();
        let window_size = window.outer_size()?;

        // Calculate center X position
        let center_x = (monitor_size.width as i32 - window_size.width as i32) / 2;

        // Set the window position
        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: center_x,
            y: y_offset,
        }))?;
    }

    Ok(())
}

/// Future function for centering window completely (both X and Y)
#[allow(dead_code)]
pub fn center_window_completely(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(monitor) = window.primary_monitor()? {
        let monitor_size = monitor.size();
        let window_size = window.outer_size()?;

        let center_x = (monitor_size.width as i32 - window_size.width as i32) / 2;
        let center_y = (monitor_size.height as i32 - window_size.height as i32) / 2;

        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: center_x,
            y: center_y,
        }))?;
    }

    Ok(())
}

#[tauri::command]
pub fn set_window_height(window: tauri::WebviewWindow, height: u32) -> Result<(), String> {
    use tauri::{LogicalSize, Size};

    // Simply set the window size with fixed width and new height
    let new_size = LogicalSize::new(600.0, height as f64);
    window
        .set_size(Size::Logical(new_size))
        .map_err(|e| format!("Failed to resize window: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn open_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    show_dashboard_window(&app)
}

#[tauri::command]
pub fn toggle_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(dashboard_window) = app.get_webview_window("dashboard") {
        match dashboard_window.is_visible() {
            Ok(true) => {
                // Window is visible, hide it
                dashboard_window
                    .hide()
                    .map_err(|e| format!("Failed to hide dashboard window: {}", e))?;
            }
            Ok(false) => {
                // Window is hidden, show and focus it
                dashboard_window
                    .show()
                    .map_err(|e| format!("Failed to show dashboard window: {}", e))?;
                dashboard_window
                    .set_focus()
                    .map_err(|e| format!("Failed to focus dashboard window: {}", e))?;
            }
            Err(e) => {
                return Err(format!("Failed to check dashboard visibility: {}", e));
            }
        }
    } else {
        // Window doesn't exist, create and show it
        show_dashboard_window(&app)?;
    }

    Ok(())
}

#[tauri::command]
pub fn set_content_protected(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    for label in ["main", "dashboard", "clients", "pre_meeting", "post_meeting_summary", "recording"] {
        if let Some(window) = app.get_webview_window(label) {
            window
                .set_content_protected(enabled)
                .map_err(|e| format!("Failed to set content protection on {}: {}", label, e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn move_window(app: tauri::AppHandle, direction: String, step: i32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let current_pos = window
            .outer_position()
            .map_err(|e| format!("Failed to get window position: {}", e))?;

        let (new_x, new_y) = match direction.as_str() {
            "up" => (current_pos.x, current_pos.y - step),
            "down" => (current_pos.x, current_pos.y + step),
            "left" => (current_pos.x - step, current_pos.y),
            "right" => (current_pos.x + step, current_pos.y),
            _ => return Err(format!("Invalid direction: {}", direction)),
        };

        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: new_x,
                y: new_y,
            }))
            .map_err(|e| format!("Failed to set window position: {}", e))?;
    } else {
        return Err("Main window not found".to_string());
    }

    Ok(())
}

pub fn create_dashboard_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<WebviewWindow<R>, tauri::Error> {
    let base_builder =
        WebviewWindowBuilder::new(app, "dashboard", tauri::WebviewUrl::App("/chats".into()));

    #[cfg(target_os = "macos")]
    let base_builder = base_builder
        .title("Salesly - Dashboard")
        .center()
        .decorations(true)
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .content_protected(true)
        .visible(true)
        .traffic_light_position(LogicalPosition::new(14.0, 18.0));

    #[cfg(not(target_os = "macos"))]
    let base_builder = base_builder
        .title("Salesly - Dashboard")
        .center()
        .decorations(true)
        .inner_size(800.0, 600.0)
        .min_inner_size(800.0, 600.0)
        .content_protected(true)
        .visible(false);

    let window = base_builder.build()?;

    // Set up close event handler - hide window instead of destroying it
    setup_dashboard_close_handler(&window);

    Ok(window)
}

/// Sets up the close event handler for the dashboard window
fn setup_dashboard_close_handler<R: Runtime>(window: &WebviewWindow<R>) {
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            // Prevent the window from being destroyed
            api.prevent_close();
            // Hide the window instead
            if let Err(e) = window_clone.hide() {
                eprintln!("Failed to hide dashboard window on close: {}", e);
            }
        }
    });
}

#[tauri::command]
pub fn open_clients(app: tauri::AppHandle) -> Result<(), String> {
    show_clients_window(&app)
}

#[tauri::command]
pub fn toggle_clients(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("clients") {
        match window.is_visible() {
            Ok(true) => {
                window
                    .hide()
                    .map_err(|e| format!("Failed to hide clients window: {}", e))?;
            }
            Ok(false) => {
                window
                    .show()
                    .map_err(|e| format!("Failed to show clients window: {}", e))?;
                window
                    .set_focus()
                    .map_err(|e| format!("Failed to focus clients window: {}", e))?;
            }
            Err(e) => {
                return Err(format!("Failed to check clients visibility: {}", e));
            }
        }
    } else {
        show_clients_window(&app)?;
    }
    Ok(())
}

pub fn create_clients_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<WebviewWindow<R>, tauri::Error> {
    let base_builder =
        WebviewWindowBuilder::new(app, "clients", tauri::WebviewUrl::App("/clients".into()));

    #[cfg(target_os = "macos")]
    let base_builder = base_builder
        .title("Clients")
        .center()
        .decorations(true)
        .inner_size(600.0, 900.0)
        .min_inner_size(600.0, 400.0)
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .content_protected(true)
        .visible(false)
        .traffic_light_position(LogicalPosition::new(14.0, 18.0));

    #[cfg(not(target_os = "macos"))]
    let base_builder = base_builder
        .title("Clients")
        .center()
        .decorations(true)
        .inner_size(900.0, 650.0)
        .min_inner_size(600.0, 400.0)
        .content_protected(true)
        .visible(false);

    let window = base_builder.build()?;

    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Err(e) = window_clone.hide() {
                eprintln!("Failed to hide clients window on close: {}", e);
            }
        }
    });

    Ok(window)
}

// ── Pre-meeting window ─────────────────────────────────────────────────────

pub fn create_pre_meeting_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<WebviewWindow<R>, tauri::Error> {
    let base_builder = WebviewWindowBuilder::new(
        app,
        "pre_meeting",
        tauri::WebviewUrl::App("/pre-meeting".into()),
    );

    #[cfg(target_os = "macos")]
    let base_builder = base_builder
        .title("Pre-Meeting Brief")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .inner_size(380.0, 650.0)
        .content_protected(true)
        .visible(false)
        .visible_on_all_workspaces(true)
        .accept_first_mouse(true)
        .shadow(false);

    #[cfg(not(target_os = "macos"))]
    let base_builder = base_builder
        .title("Pre-Meeting Brief")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .inner_size(380.0, 650.0)
        .content_protected(true)
        .visible(false);

    let window = base_builder.build()?;

    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Err(e) = window_clone.hide() {
                eprintln!("Failed to hide pre-meeting window: {}", e);
            }
        }
    });

    Ok(window)
}

fn position_pre_meeting_window<R: Runtime>(window: &WebviewWindow<R>) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale = monitor.scale_factor();
        let monitor_w = monitor.size().width as i32;
        let win_physical_w = (380.0 * scale) as i32;
        let margin = (20.0 * scale) as i32;
        let x = monitor_w - win_physical_w - margin;
        let y = (80.0 * scale) as i32;
        let _ = window.set_position(tauri::Position::Physical(
            tauri::PhysicalPosition { x, y },
        ));
    }
}

pub fn show_pre_meeting_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = if let Some(w) = app.get_webview_window("pre_meeting") {
        w
    } else {
        create_pre_meeting_window(app)
            .map_err(|e| format!("Failed to create pre-meeting window: {}", e))?
    };
    position_pre_meeting_window(&window);
    window
        .show()
        .map_err(|e| format!("Failed to show pre-meeting window: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn open_pre_meeting(app: tauri::AppHandle) -> Result<(), String> {
    show_pre_meeting_window(&app)
}

#[tauri::command]
pub fn close_pre_meeting(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pre_meeting") {
        window
            .hide()
            .map_err(|e| format!("Failed to hide pre-meeting window: {}", e))?;
    }
    Ok(())
}

// ── Post-meeting summary window ────────────────────────────────────────────

pub fn create_post_meeting_summary_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<WebviewWindow<R>, tauri::Error> {
    let base_builder = WebviewWindowBuilder::new(
        app,
        "post_meeting_summary",
        tauri::WebviewUrl::App("/post-meeting-summary".into()),
    );

    #[cfg(target_os = "macos")]
    let base_builder = base_builder
        .title("Meeting Summary")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .inner_size(500.0, 700.0)
        .content_protected(true)
        .visible(false)
        .visible_on_all_workspaces(true)
        .accept_first_mouse(true)
        .shadow(false);

    #[cfg(not(target_os = "macos"))]
    let base_builder = base_builder
        .title("Meeting Summary")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .inner_size(500.0, 700.0)
        .content_protected(true)
        .visible(false);

    let window = base_builder.build()?;

    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Err(e) = window_clone.hide() {
                eprintln!("Failed to hide post-meeting summary window: {}", e);
            }
        }
    });

    Ok(window)
}

fn position_post_meeting_summary_window<R: Runtime>(window: &WebviewWindow<R>) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale = monitor.scale_factor();
        let monitor_w = monitor.size().width as i32;
        let win_physical_w = (500.0 * scale) as i32;
        let x = (monitor_w - win_physical_w) / 2;
        let y = (80.0 * scale) as i32;
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x,
            y,
        }));
    }
}

pub fn show_post_meeting_summary_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = if let Some(w) = app.get_webview_window("post_meeting_summary") {
        w
    } else {
        create_post_meeting_summary_window(app)
            .map_err(|e| format!("Failed to create post-meeting summary window: {}", e))?
    };
    position_post_meeting_summary_window(&window);
    window
        .show()
        .map_err(|e| format!("Failed to show post-meeting summary window: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn open_post_meeting_summary(app: tauri::AppHandle) -> Result<(), String> {
    show_post_meeting_summary_window(&app)
}

#[tauri::command]
pub fn close_post_meeting_summary(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("post_meeting_summary") {
        window
            .hide()
            .map_err(|e| format!("Failed to hide post-meeting summary window: {}", e))?;
    }
    Ok(())
}

// ── Recording window ───────────────────────────────────────────────────────

pub fn create_recording_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<WebviewWindow<R>, tauri::Error> {
    let base_builder = WebviewWindowBuilder::new(
        app,
        "recording",
        tauri::WebviewUrl::App("/recording".into()),
    );

    #[cfg(target_os = "macos")]
    let base_builder = base_builder
        .title("Meeting Analysis")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .inner_size(420.0, 650.0)
        .content_protected(true)
        .visible(false)
        .visible_on_all_workspaces(true)
        .accept_first_mouse(true)
        .shadow(false);

    #[cfg(not(target_os = "macos"))]
    let base_builder = base_builder
        .title("Meeting Analysis")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .inner_size(420.0, 650.0)
        .content_protected(true)
        .visible(false);

    let window = base_builder.build()?;

    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Err(e) = window_clone.hide() {
                eprintln!("Failed to hide recording window: {}", e);
            }
        }
    });

    Ok(window)
}

fn position_recording_window<R: Runtime>(window: &WebviewWindow<R>) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale = monitor.scale_factor();
        let margin = (20.0 * scale) as i32;
        let y = (80.0 * scale) as i32;
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: margin,
            y,
        }));
    }
}

pub fn show_recording_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = if let Some(w) = app.get_webview_window("recording") {
        w
    } else {
        create_recording_window(app)
            .map_err(|e| format!("Failed to create recording window: {}", e))?
    };
    position_recording_window(&window);
    window
        .show()
        .map_err(|e| format!("Failed to show recording window: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn open_recording(app: tauri::AppHandle) -> Result<(), String> {
    show_recording_window(&app)
}

#[tauri::command]
pub fn close_recording(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("recording") {
        window
            .hide()
            .map_err(|e| format!("Failed to hide recording window: {}", e))?;
    }
    Ok(())
}

// ── Clients window ─────────────────────────────────────────────────────────

pub fn show_clients_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("clients") {
        window
            .show()
            .map_err(|e| format!("Failed to show clients window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus clients window: {}", e))?;
    } else {
        let window = create_clients_window(app)
            .map_err(|e| format!("Failed to create clients window: {}", e))?;
        window
            .show()
            .map_err(|e| format!("Failed to show new clients window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus new clients window: {}", e))?;
    }
    Ok(())
}

/// Shows the dashboard window and brings it to focus
pub fn show_dashboard_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(dashboard_window) = app.get_webview_window("dashboard") {
        // Window exists, show and focus it
        dashboard_window
            .show()
            .map_err(|e| format!("Failed to show dashboard window: {}", e))?;
        dashboard_window
            .set_focus()
            .map_err(|e| format!("Failed to focus dashboard window: {}", e))?;
    } else {
        // Window doesn't exist, create it and then show it
        let window = create_dashboard_window(app)
            .map_err(|e| format!("Failed to create dashboard window: {}", e))?;
        window
            .show()
            .map_err(|e| format!("Failed to show new dashboard window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus new dashboard window: {}", e))?;
    }
    Ok(())
}
