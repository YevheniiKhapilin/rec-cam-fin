"""Hand-controlled particle visualizer.

Keys 1, 2, and 3 are demo controls when a camera is unavailable.
"""

from __future__ import annotations

import math
import random
import sys
import threading
from collections import deque
from functools import lru_cache
from pathlib import Path
from typing import Iterable

import cv2
import mediapipe as mp
import numpy as np
import pygame


WIDTH, HEIGHT = 1280, 760
PARTICLE_COUNT = 5600
FONT_PATHS = (
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)


def make_space(count: int) -> np.ndarray:
    radius = np.random.uniform(2.0, 5.2, count)
    theta = np.random.uniform(0, math.tau, count)
    phi = np.arccos(np.random.uniform(-1, 1, count))
    return np.column_stack((
        radius * np.sin(phi) * np.cos(theta),
        radius * np.sin(phi) * np.sin(theta),
        radius * np.cos(phi),
    )).astype(np.float32)


def make_heart(count: int) -> np.ndarray:
    t = np.random.uniform(0, math.tau, count)
    scale = np.random.uniform(0.92, 1.08, count)
    x = 16 * np.sin(t) ** 3
    y = 13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t)
    return np.column_stack((x * 0.17 * scale, y * 0.17 * scale, np.random.normal(0, 0.28, count))).astype(np.float32)


def make_text(count: int, text: str) -> np.ndarray:
    surface = pygame.Surface((1500, 260), pygame.SRCALPHA)
    font = next((pygame.font.Font(path, 92) for path in FONT_PATHS if Path(path).exists()), pygame.font.Font(None, 88))
    rendered = font.render(text, True, (255, 255, 255, 255))
    surface.blit(rendered, rendered.get_rect(center=surface.get_rect().center))
    alpha = pygame.surfarray.array_alpha(surface)
    xs, ys = np.where(alpha > 50)
    if len(xs) == 0:
        return np.zeros((count, 3), dtype=np.float32)
    selected = np.random.randint(0, len(xs), count)
    return np.column_stack(((xs[selected] - 750) / 135, -(ys[selected] - 130) / 135, np.random.normal(0, 0.06, count))).astype(np.float32)


def project(points: np.ndarray, width: int, height: int, rotation: float, tilt: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    cos_y, sin_y = math.cos(rotation), math.sin(rotation)
    rotated_x = points[:, 0] * cos_y - points[:, 2] * sin_y
    rotated_z = points[:, 0] * sin_y + points[:, 2] * cos_y
    tilted_y = points[:, 1] * math.cos(tilt) - rotated_z * math.sin(tilt)
    tilted_z = points[:, 1] * math.sin(tilt) + rotated_z * math.cos(tilt)
    distance = tilted_z + 8.5
    scale = 440 / np.maximum(distance, 1)
    screen = np.column_stack((width / 2 + rotated_x * scale, height / 2 - tilted_y * scale))
    return screen.astype(np.int32), scale


def raised_fingers(hand_landmarks: Iterable[object]) -> int:
    landmarks = list(hand_landmarks)
    tips = (8, 12, 16, 20)
    pips = (6, 10, 14, 18)
    return min(4, sum(landmarks[tip].y < landmarks[pip].y for tip, pip in zip(tips, pips)))


def draw_label(screen: pygame.Surface, text: str, position: tuple[int, int], size: int, color: tuple[int, int, int]) -> None:
    screen.blit(get_label_surface(text, size, color), position)


@lru_cache(maxsize=16)
def get_font(size: int) -> pygame.font.Font:
    return pygame.font.SysFont("Arial", size)


@lru_cache(maxsize=128)
def get_label_surface(text: str, size: int, color: tuple[int, int, int]) -> pygame.Surface:
    return get_font(size).render(text, True, color)


def render_particles(screen: pygame.Surface, projected: np.ndarray, scale: np.ndarray, particle_colors: np.ndarray, left: int, top: int, right: int, bottom: int) -> None:
    visible = (
        (projected[:, 0] >= left)
        & (projected[:, 0] < right)
        & (projected[:, 1] >= top)
        & (projected[:, 1] < bottom)
    )
    points = projected[visible]
    if len(points) == 0:
        return
    pixels = pygame.surfarray.pixels3d(screen)
    pixels[points[:, 0], points[:, 1]] = particle_colors[visible]
    del pixels


def make_kiss_icon() -> pygame.Surface:
    icon = pygame.Surface((144, 144), pygame.SRCALPHA)
    pygame.draw.circle(icon, (255, 206, 92), (72, 72), 58)
    pygame.draw.circle(icon, (255, 225, 139), (68, 67), 51)
    pygame.draw.arc(icon, (91, 58, 48), (37, 47, 27, 20), math.pi * 0.12, math.pi * 0.88, 4)
    pygame.draw.arc(icon, (91, 58, 48), (76, 47, 27, 20), math.pi * 0.12, math.pi * 0.88, 4)
    pygame.draw.ellipse(icon, (246, 133, 119), (31, 78, 20, 10))
    pygame.draw.ellipse(icon, (246, 133, 119), (91, 78, 20, 10))
    pygame.draw.ellipse(icon, (188, 57, 91), (62, 77, 28, 19))
    pygame.draw.ellipse(icon, (255, 119, 142), (69, 79, 15, 10))
    pygame.draw.circle(icon, (255, 91, 119), (113, 38), 12)
    pygame.draw.circle(icon, (255, 91, 119), (129, 38), 12)
    pygame.draw.polygon(icon, (255, 91, 119), ((102, 43), (140, 43), (121, 65)))
    pygame.draw.circle(icon, (255, 160, 177), (110, 34), 4)
    return icon


def draw_kiss(screen: pygame.Surface, center: tuple[int, int], frame_number: int, icon: pygame.Surface) -> None:
    emoji = icon
    yaw = math.cos(frame_number * 0.035)
    if yaw < 0:
        emoji = pygame.transform.flip(emoji, True, False)
    emoji = pygame.transform.smoothscale(emoji, (max(2, int(emoji.get_width() * abs(yaw))), emoji.get_height()))
    screen.blit(emoji, emoji.get_rect(center=center))

    for index in range(14):
        phase = frame_number * 0.018 + index * math.tau / 14
        radius = 82 + 10 * math.sin(index * 2.1)
        x = int(center[0] + math.cos(phase) * radius)
        y = int(center[1] + math.sin(phase) * radius * 0.58)
        pulse = 0.82 + 0.18 * math.sin(frame_number * 0.12 + index * 1.7)
        size = int((8 if index % 3 == 0 else 5) * pulse)
        color = (255, int(171 + 70 * pulse), int(211 + 40 * pulse))
        pygame.draw.line(screen, color, (x - size, y), (x + size, y), 2)
        pygame.draw.line(screen, color, (x, y - size), (x, y + size), 2)


def main() -> None:
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT), pygame.RESIZABLE)
    pygame.display.set_caption("Жест / Материя — управление частицами")
    clock = pygame.time.Clock()
    kiss_icon = make_kiss_icon()
    targets = {
        1: make_space(PARTICLE_COUNT),
        2: make_heart(PARTICLE_COUNT),
        3: make_text(PARTICLE_COUNT, "Я люблю тебя, Лесюша"),
        4: make_text(PARTICLE_COUNT, "поцелуйчик тебе"),
    }
    particles = targets[1].copy()
    color_pairs = {1: ((116, 86, 255), (23, 36, 93)), 2: ((255, 63, 105), (255, 154, 158)), 3: ((245, 248, 255), (155, 221, 255)), 4: ((255, 177, 211), (255, 244, 250))}
    particle_colors = {}
    for key, (color_a, color_b) in color_pairs.items():
        blend = (np.arange(PARTICLE_COUNT) % 17).astype(np.float32)[:, None] / 17
        particle_colors[key] = (np.array(color_a) * (1 - blend) + np.array(color_b) * blend).astype(np.uint8)
    gesture = 1
    history: deque[int] = deque(maxlen=7)
    rotation = 0.0
    camera = cv2.VideoCapture(0)
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 320)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)
    camera.set(cv2.CAP_PROP_FPS, 15)
    hands = mp.solutions.hands.Hands(static_image_mode=False, max_num_hands=1, min_detection_confidence=0.65, min_tracking_confidence=0.55)
    stop_tracking = threading.Event()
    gesture_lock = threading.Lock()
    detected_gesture: list[int | None] = [None]

    def track_hand() -> None:
        inference_frame = 0
        while not stop_tracking.is_set():
            ok, frame = camera.read()
            if not ok:
                stop_tracking.wait(0.05)
                continue
            inference_frame += 1
            if inference_frame % 3:
                continue
            result = hands.process(cv2.cvtColor(cv2.flip(frame, 1), cv2.COLOR_BGR2RGB))
            if result.multi_hand_landmarks:
                history.append(raised_fingers(result.multi_hand_landmarks[0].landmark))
                if len(history) >= 4 and len(set(history)) == 1 and history[-1] in (1, 2, 3, 4):
                    with gesture_lock:
                        detected_gesture[0] = history[-1]

    tracker_thread = threading.Thread(target=track_hand, daemon=True)
    tracker_thread.start()
    delta = np.empty_like(particles)
    frame_number = 0
    running = True

    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_1, pygame.K_2, pygame.K_3, pygame.K_4):
                    gesture = int(event.unicode)
                elif event.key == pygame.K_ESCAPE:
                    running = False

        with gesture_lock:
            if detected_gesture[0] is not None:
                gesture = detected_gesture[0]
                detected_gesture[0] = None

        frame_number += 1
        np.subtract(targets[gesture], particles, out=delta)
        delta *= 0.12
        particles += delta
        rotation += 0.006
        screen.fill((8, 10, 22))
        width, height = screen.get_size()
        pygame.draw.rect(screen, (12, 15, 34), (28, 28, width - 56, height - 56), border_radius=2)
        pygame.draw.rect(screen, (38, 43, 78), (28, 28, width - 56, height - 56), 1, border_radius=2)
        scene_rotation = math.sin(frame_number * 0.025) * 0.05 if gesture in (3, 4) else rotation
        tilt = math.radians(4) if gesture in (3, 4) else 0.0
        projected, scale = project(particles, width - 360, height - 56, scene_rotation, tilt)
        projected[:, 0] += 180
        if gesture == 4:
            projected[:, 1] += 70
        render_particles(screen, projected[::2], scale[::2], particle_colors[gesture][::2], 55, 55, width - 360, height - 55)
        if gesture == 4:
            draw_kiss(screen, (width // 2, height // 3), frame_number, kiss_icon)

        pygame.draw.line(screen, (42, 46, 82), (width - 330, 28), (width - 330, height - 28), 1)
        draw_label(screen, "ЖЕСТ / МАТЕРИЯ", (55, 48), 15, (244, 241, 236))
        camera_ready = camera.isOpened()
        draw_label(screen, "КАМЕРА ВКЛЮЧЕНА" if camera_ready else "КАМЕРА НЕДОСТУПНА", (width - 250, 50), 11, (145, 239, 208) if camera_ready else (255, 112, 130))
        draw_label(screen, "ВИЗУАЛИЗАЦИЯ", (55, 92), 11, (141, 146, 178))
        labels = {1: "КОСМИЧЕСКОЕ ПОЛЕ", 2: "СИГНАЛ СЕРДЦА", 3: "Я ЛЮБЛЮ ТЕБЯ, ЛЕСЮША", 4: "ПОЦЕЛУЙЧИК ТЕБЕ"}
        descriptions = {
            1: "Рассыпь звёзды: пусть космос закружится у тебя на ладони.",
            2: "Алые искры сходятся в сердце — будто его нарисовали для тебя.",
            3: "Тёплые слова держатся в воздухе и едва заметно покачиваются.",
            4: "Отправь воздушный поцелуй: он кружится, искры вспыхивают вокруг.",
        }
        draw_label(screen, labels[gesture], (55, 116), 17, (245, 245, 250))
        draw_label(screen, descriptions[gesture], (55, 145), 11, (141, 146, 178))
        draw_label(screen, "ЖЕСТЫ", (width - 285, 92), 11, (141, 146, 178))
        draw_label(screen, "[1]  ОДИН ПАЛЕЦ", (width - 285, 140), 13, (255, 255, 255) if gesture == 1 else (130, 136, 163))
        draw_label(screen, "[2]  ДВА ПАЛЬЦА", (width - 285, 180), 13, (255, 255, 255) if gesture == 2 else (130, 136, 163))
        draw_label(screen, "[3]  ТРИ ПАЛЬЦА", (width - 285, 220), 13, (255, 255, 255) if gesture == 3 else (130, 136, 163))
        draw_label(screen, "[4]  ЧЕТЫРЕ ПАЛЬЦА", (width - 285, 260), 13, (255, 255, 255) if gesture == 4 else (130, 136, 163))
        draw_label(screen, "Покажите руку камере", (width - 285, height - 112), 11, (104, 111, 145))
        draw_label(screen, f"ПАЛЬЦЕВ ОБНАРУЖЕНО   {gesture}", (width - 285, height - 82), 11, (145, 239, 208))
        draw_label(screen, "ESC  ВЫХОД", (55, height - 55), 10, (104, 111, 145))
        pygame.display.flip()
        clock.tick(60)

    stop_tracking.set()
    camera.release()
    tracker_thread.join(timeout=1)
    hands.close()
    pygame.quit()
    sys.exit(0)


if __name__ == "__main__":
    main()