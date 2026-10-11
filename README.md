# Gesture / Matter

A Python + Flask + MediaPipe web app that turns hand gestures into animated particle scenes. The browser uses its own camera permission; camera images are sent to the Python server for hand detection, while particle animation runs locally in the browser.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://localhost:5000` and select **Enable camera**. Camera access requires HTTPS when deployed (localhost is allowed for development). Use keys `1`, `2`, and `3` or the scene presets to preview without the camera.

## Deploy to Render

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint** and connect the repository.
3. Render reads `render.yaml`, installs `requirements.txt`, and starts the Flask app with Gunicorn.
4. Open the generated `https://…onrender.com` URL and allow camera access.

The `.python-version` file pins the service to Python 3.11.11. MediaPipe 0.10.21 does not publish a compatible package for Render's default Python 3.14 runtime.

The `render.yaml` configuration runs a single Python worker because the MediaPipe hand detector is shared and synchronized. The free Render service may sleep when idle and take a little time to wake up.

## Desktop app

The original Pygame desktop version remains in `main.py` and can be run separately with `python main.py` after installing the same requirements.