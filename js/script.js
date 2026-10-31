/**
 * Aadish Jain — Core Portfolio Controller
 * Standalone Bunny Companion & Theme Controller
 */

import { BunnyCompanion } from '../rabbit-logic/bunny.js';

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // 1. Theme Management (Sleek Dark Mode as Primary)
    // ==========================================================================
    const themeToggles = document.querySelectorAll('.js-theme-toggle');
    const htmlEl = document.documentElement;

    function initTheme() {
        const saved = localStorage.getItem('pm_theme');
        if (saved === 'light') {
            htmlEl.classList.remove('dark-mode');
            updateThemeIcons(false);
        } else {
            htmlEl.classList.add('dark-mode');
            updateThemeIcons(true);
        }
    }

    function updateThemeIcons(isDark) {
        themeToggles.forEach(btn => {
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = isDark ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
            }
        });
    }

    function toggleTheme() {
        const isDark = htmlEl.classList.toggle('dark-mode');
        localStorage.setItem('pm_theme', isDark ? 'dark' : 'light');
        updateThemeIcons(isDark);
    }

    themeToggles.forEach(btn => btn.addEventListener('click', toggleTheme));
    initTheme();

    // ==========================================================================
    // 2. Apple Keynote Stage: Liquid Glass Segmented Switcher & Spatial Depth
    // ==========================================================================
    const tabLeadership = document.getElementById('tab-leadership');
    const tabSpatial = document.getElementById('tab-spatial');
    const indicator = document.getElementById('segmented-indicator');
    const portraitLeadership = document.querySelector('.portrait-leadership');
    const portraitSpatial = document.querySelector('.portrait-spatial');
    const telemetryText = document.getElementById('telemetry-text');
    const lensFrame = document.getElementById('apple-lens-frame');
    const stageChassis = document.getElementById('apple-stage-chassis');

    let currentMode = 'leadership';

    function setStageMode(mode) {
        if (mode === currentMode) return;
        currentMode = mode;

        stageChassis?.classList.toggle('mode-spatial', mode === 'spatial');

        if (mode === 'spatial') {
            tabLeadership?.classList.remove('active');
            tabLeadership?.setAttribute('aria-selected', 'false');
            tabSpatial?.classList.add('active');
            tabSpatial?.setAttribute('aria-selected', 'true');

            if (indicator) {
                indicator.style.transform = 'translateX(100%)';
            }

            portraitLeadership?.classList.remove('active');
            portraitSpatial?.classList.add('active');

            if (telemetryText) {
                telemetryText.textContent = 'ACTIVE FOCUS • 0 → 1 PROTOTYPING & NATIVE SYSTEMS';
            }
        } else {
            tabSpatial?.classList.remove('active');
            tabSpatial?.setAttribute('aria-selected', 'false');
            tabLeadership?.classList.add('active');
            tabLeadership?.setAttribute('aria-selected', 'true');

            if (indicator) {
                indicator.style.transform = 'translateX(0)';
            }

            portraitSpatial?.classList.remove('active');
            portraitLeadership?.classList.add('active');

            if (telemetryText) {
                telemetryText.textContent = 'ACTIVE FOCUS • ROADMAPS, DISCOVERY & METRICS';
            }
        }

        // Optional subtle tactile chime feedback via Blinky audio if available
        try {
            window.__bunny?.playMunchSound?.();
        } catch (_) {}
    }

    tabLeadership?.addEventListener('click', () => setStageMode('leadership'));
    tabSpatial?.addEventListener('click', () => setStageMode('spatial'));

    // Tap on portrait frame directly to toggle modes (tactile mobile discovery)
    lensFrame?.addEventListener('click', () => {
        setStageMode(currentMode === 'leadership' ? 'spatial' : 'leadership');
    });

    // Dynamic Physical Glare & Subtle Spatial Parallax (Pointer devices only)
    if (stageChassis && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        let rafId = null;

        stageChassis.addEventListener('pointermove', (e) => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const rect = stageChassis.getBoundingClientRect();
                const normX = (e.clientX - rect.left) / rect.width - 0.5;
                const normY = (e.clientY - rect.top) / rect.height - 0.5;
                const tiltX = (-normY * 7).toFixed(2);
                const tiltY = (normX * 7).toFixed(2);
                stageChassis.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;

                if (lensFrame) {
                    const lensRect = lensFrame.getBoundingClientRect();
                    const gx = (((e.clientX - lensRect.left) / lensRect.width) * 100).toFixed(1);
                    const gy = (((e.clientY - lensRect.top) / lensRect.height) * 100).toFixed(1);
                    lensFrame.style.setProperty('--glare-x', `${gx}%`);
                    lensFrame.style.setProperty('--glare-y', `${gy}%`);
                }
            });
        });

        stageChassis.addEventListener('pointerleave', () => {
            if (rafId) cancelAnimationFrame(rafId);
            stageChassis.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
        });
    }

    // ==========================================================================
    // 3. Standalone Modular Bunny Companion (rabbit-logic)
    // ==========================================================================
    const bunnyCompanion = new BunnyCompanion({
        modelPath: 'assets/rabbit.glb',
        adminEmail: 'aadishhere@gmail.com'
    });
    bunnyCompanion.init();
    window.__bunny = bunnyCompanion;
});