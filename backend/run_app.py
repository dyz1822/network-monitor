import os
import sys
import webbrowser
import threading
import time
import uvicorn


def resource_path(relative_path):
    """Get absolute path (works for PyInstaller)"""
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)


def open_browser():
    time.sleep(2)
    webbrowser.open("http://127.0.0.1:9000")


if __name__ == "__main__":

    threading.Thread(target=open_browser).start()

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=9000,
        log_level="warning"
    )