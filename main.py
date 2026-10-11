"""Hand-controlled particle visualizer.

Keys 1, 2, and 3 are demo controls when a camera is unavailable.
"""

from __future__ import annotations

import math
import random
import sys
from collections import deque
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
    font = next((pygame.font.Font(path, 104) for path in FONT_PATHS if Path(path).exists()), pygame.font.Font(None, 100))
    rendered = font.render(text, True, (255, 255, 255, 255))
    surface.blit(rendered, rendered.get_rect(center=surface.get_rect().center))
    alpha = pygame.surfarray.array_alpha(surface)
    xs, ys = np.where(alpha > 50)
    if len(xs) == 0:
        return np.zeros((count, 3), dtype=np.float32)
    selected = np.random.randint(0, len(xs), count)
    return np.column_stack(((xs[selected] - 750) / 125, -(ys[selected] - 130) / 125, np.random.normal(0, 0.06, count))).astype(np.float32)


def project(points: np.ndarray, width: int, height: int, rotation: float) -> tuple[np.ndarray, np.ndarray]:
    cos_y, sin_y = math.cos(rotation), math.sin(rotation)
    rotated_x = points[:, 0] * cos_y - points[:, 2] * sin_y
    rotated_z = points[:, 0] * sin_y + points[:, 2] * cos_y
    distance = rotated_z + 8.5
    scale = 440 / np.maximum(distance, 1)
    screen = np.column_stack((width / 2 + rotated_x * scale, height / 2 - points[:, 1] * scale))
    return screen.astype(np.int32), scale


def raised_fingers(hand_landmarks: Iterable[object]) -> int:
    landmarks = list(hand_landmarks)
    tips = (8, 12, 16, 20)
    pips = (6, 10, 14, 18)
    return min(3, sum(landmarks[tip].y < landmarks[pip].y for tip, pip in zip(tips, pips)))


def draw_label(screen: pygame.Surface, text: str, position: tuple[int, int], size: int, color: tuple[int, int, int]) -> None:
    font = pygame.font.SysFont("Arial", size)
    screen.blit(font.render(text, True, color), position)


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
    pygame.surfarray.blit_array(screen, pixels)
    del pixels


def main() -> None:
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT), pygame.RESIZABLE)
    pygame.display.set_caption("Hand / Particle Tool")
    clock = pygame.time.Clock()
    targets = {1: make_space(PARTICLE_COUNT), 2: make_heart(PARTICLE_COUNT), 3: make_text(PARTICLE_COUNT, "Я люблю тебя, Леся")}
    particles = targets[1].copy()
    color_pairs = {1: ((116, 86, 255), (23, 36, 93)), 2: ((255, 63, 105), (255, 154, 158)), 3: ((245, 248, 255), (155, 221, 255))}
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
    hands = mp.solutions.hands.Hands(static_image_mode=False, max_num_hands=1, min_detection_confidence=0.65, min_tracking_confidence=0.55)
    frame_number = 0
    running = True

    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                    gesture = int(event.unicode)
                elif event.key == pygame.K_ESCAPE:
                    running = False

        ok, frame = camera.read()
        if ok and frame_number % 3 == 0:
            result = hands.process(cv2.cvtColor(cv2.flip(frame, 1), cv2.COLOR_BGR2RGB))
            if result.multi_hand_landmarks:
                history.append(raised_fingers(result.multi_hand_landmarks[0].landmark))
                if len(history) >= 4 and len(set(history)) == 1 and history[-1] in (1, 2, 3):
                    gesture = history[-1]

        frame_number += 1
        particles += (targets[gesture] - particles) * 0.12
        rotation += 0.006
        screen.fill((8, 10, 22))
        width, height = screen.get_size()
        pygame.draw.rect(screen, (12, 15, 34), (28, 28, width - 56, height - 56), border_radius=2)
        pygame.draw.rect(screen, (38, 43, 78), (28, 28, width - 56, height - 56), 1, border_radius=2)
        projected, scale = project(particles, width - 360, height - 56, rotation)
        projected[:, 0] += 180
        render_particles(screen, projected[::2], scale[::2], particle_colors[gesture][::2], 55, 55, width - 360, height - 55)

        pygame.draw.line(screen, (42, 46, 82), (width - 330, 28), (width - 330, height - 28), 1)
        draw_label(screen, "HAND / PARTICLE TOOL", (55, 48), 15, (244, 241, 236))
        draw_label(screen, "CAMERA LIVE" if ok else "CAMERA UNAVAILABLE", (width - 250, 50), 11, (145, 239, 208) if ok else (255, 112, 130))
        draw_label(screen, "OUTPUT VIEW", (55, 92), 11, (141, 146, 178))
        labels = {1: "SPACE FIELD", 2: "HEART SIGNAL", 3: "Я ЛЮБЛЮ ТЕБЯ, ЛЕСЯ"}
        draw_label(screen, labels[gesture], (55, 116), 17, (245, 245, 250))
        draw_label(screen, "GESTURE PRESETS", (width - 285, 92), 11, (141, 146, 178))
        draw_label(screen, "[1]  ONE FINGER", (width - 285, 140), 13, (255, 255, 255) if gesture == 1 else (130, 136, 163))
        draw_label(screen, "[2]  TWO FINGERS", (width - 285, 180), 13, (255, 255, 255) if gesture == 2 else (130, 136, 163))
        draw_label(screen, "[3]  THREE FINGERS", (width - 285, 220), 13, (255, 255, 255) if gesture == 3 else (130, 136, 163))
        draw_label(screen, "Show your hand to the camera", (width - 285, height - 112), 11, (104, 111, 145))
        draw_label(screen, f"FINGERS DETECTED   {gesture}", (width - 285, height - 82), 11, (145, 239, 208))
        draw_label(screen, "ESC  CLOSE", (55, height - 55), 10, (104, 111, 145))
        pygame.display.flip()
        clock.tick(60)

    hands.close()
    camera.release()
    pygame.quit()
    sys.exit(0)


if __name__ == "__main__":
    main()