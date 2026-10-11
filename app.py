"""Flask server for the browser-hosted hand particle visualizer."""

from __future__ import annotations

import base64
import threading

import cv2
import mediapipe as mp
import numpy as np
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1_500_000

_tracker = None
_tracker_lock = threading.Lock()


def get_tracker():
    global _tracker
    if _tracker is None:
        _tracker = mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.6,
        )
    return _tracker


def count_fingers(landmarks) -> int:
    tips = (8, 12, 16, 20)
    pips = (6, 10, 14, 18)
    count = sum(landmarks[tip].y < landmarks[pip].y for tip, pip in zip(tips, pips))
    return min(3, count)


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.post("/api/gesture")
def detect_gesture():
    payload = request.get_json(silent=True) or {}
    image_data = payload.get("image", "")
    if not isinstance(image_data, str) or "," not in image_data:
        return jsonify(error="Expected a base64 camera frame"), 400

    try:
        encoded = base64.b64decode(image_data.split(",", 1)[1], validate=True)
        frame = cv2.imdecode(np.frombuffer(encoded, dtype=np.uint8), cv2.IMREAD_COLOR)
    except (ValueError, cv2.error):
        return jsonify(error="Invalid camera frame"), 400

    if frame is None:
        return jsonify(error="Could not decode camera frame"), 400

    frame = cv2.resize(frame, (320, 240), interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(cv2.flip(frame, 1), cv2.COLOR_BGR2RGB)
    with _tracker_lock:
        result = get_tracker().process(rgb)

    if not result.multi_hand_landmarks:
        return jsonify(fingers=0, detected=False)

    fingers = count_fingers(result.multi_hand_landmarks[0].landmark)
    return jsonify(fingers=fingers, detected=True)


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify(error="Camera frame is too large"), 413


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
