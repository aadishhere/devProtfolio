/**
 * 🐰 Blinky the Desktop Rabbit Companion ("rabbit-logic/bunny.js")
 * Realistic, lifelike 3D bunny companion built with Three.js.
 *
 * Core Behaviors:
 * - Pure Realistic Idle Companion: Stays calm and planted on the desk surface.
 *   Does not move body or hop across the screen on its own.
 * - Lifelike Facial Expressions & Micro-Life:
 *   • Natural rabbit sniffing bursts with twitching muzzle
 *   • 3D quivering whiskers in sync with nose sniffs
 *   • Independent ear movements (swiveling, listening to cursor, subtle twitches)
 *   • Natural eye blinking (soft periodic blinks)
 *   • Gentle head glances tracking the cursor within natural rabbit biomechanics
 *   • Calm, slow rhythmic chest breathing
 * - Scruff-of-Neck Dragging:
 *   • Can be picked up and repositioned anywhere on the page
 *   • Folds naturally from the neck, dangling with pendulum inertia
 *   • Clinical Oxygen / Heart Rate monitoring with audible pulse and EKG
 * - Realistic Death State:
 *   • When oxygen reaches 0%, rabbit suffocates and falls flat on its side
 *   • All animation tracks are frozen immediately: hands and legs STOP MOVING completely
 *   • Total lifeless stillness until revived via Admin Revive or WhatsApp/Email
 */

import { bunnyGlobalState } from './bunny-state.js';
import { bunnyFirebaseSync } from './bunny-firebase.js';

export class BunnyCompanion {
    constructor(options = {}) {
        this.options = {
            modelPath: 'assets/rabbit.glb',
            scale: 1.0,
            primaryColor: '#38bdf8',
            adminPhone: '',
            adminEmail: 'aadishhere@gmail.com',
            ...options
        };
        this.gltfBaseScale = 1.0;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.canvas = null;

        // 3D Meshes & Rigging
        this.bunnyRoot = null;
        this.gltfScene = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.isGltfLoaded = false;
        this.gltfNodes = null;
        this.gltfWhiskers = null;

        // Document-Space Coordinates (Natural resting spot on right side of desk)
        this.pagePos = {
            x: Math.min(window.innerWidth - 120, Math.floor(window.innerWidth * 0.82)),
            y: 220
        };
        this.state = 'idle'; // 'idle', 'held', 'fainted', 'pant'

        // Screen & Pointer Awareness Logic
        this.isUserOnScreen = true;
        this.isUserInteracting = false;
        this.lastUserInteractingTime = 0;
        this.lastUserActivityTime = performance.now();
        this.safeDistance = 120; // Respectful safe distance
        this.safeBubble = 75; // Personal boundary threshold

        // Target movement for safe corner evasion & polite distance
        this.targetPagePos = null;
        this.isHopping = false;
        this.hopCycle = 0;
        this.cursorAwayStartTime = 0;
        this.followDelay = 3500; // 3 to 4 seconds delay before following

        // Random Joyful Backflip (Binky)
        this.isBackflipping = false;
        this.backflipStartTime = 0;
        this.backflipDuration = 950; // ms
        this.lastBackflipTime = performance.now() + 6000;
        this.nextBackflipInterval = 28000 + Math.random() * 20000; // Random 28-48s

        // Pointer tracking for subtle inquisitive head glance
        this.hasUserMovedPointer = false;
        this.lastKnownPointer = {
            x: this.pagePos.x,
            y: this.pagePos.y,
            time: performance.now()
        };

        // Draggable, Scruff Neck & Dynamic Physics State
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.dangleAngle = 0;
        this.dangleVel = 0;
        this.dangleAccel = 0;
        this.dragVelocityX = 0;
        this.lastDragEndTime = 0;

        // Ground Contact Shadow & Landing Impact Spring
        this.shadowMesh = null;
        this.landingSquash = 0;
        this.landingSquashVel = 0;

        // Mobile Touch Scroll Hysteresis
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isTouchPrimed = false;
        this.primedHit = null;

        // Energy Saver & Reduced Motion
        this.isTabHidden = false;
        this.prefersReducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

        // Raycaster & Sensitive Parts System (Easy holding & tactile touch feedback)
        this.raycaster = new THREE.Raycaster();
        this.mouseVector = new THREE.Vector2();
        this.hoveredPart = null; // 'ears', 'head', 'scruff', 'body', 'tail', 'paws'
        this.heldPart = null;
        this.isTouching = false;

        // Vitals & Suffocation / Dying State System
        this.oxygenLevel = 100;
        this.heartRate = 140;
        this.cornerCapsuleEl = null;
        this.ekgCanvas = null;
        this.ekgCtx = null;
        this.ekgBuffer = new Float32Array(140);
        this.ekgBuffer.fill(14); // Baseline at midY
        this.ekgBeatTimer = 0;
        this.currentBeatParams = {
            pHeight: 2.2,
            qDepth: 2.8,
            rHeight: 12.0,
            sDepth: 6.5,
            tHeight: 3.2,
            sinusArrhythmia: 1.0
        };
        this.lastBeepTime = 0;
        this.pantStartTime = 0;
        this.audioCtx = null;
        this.lastPetTime = 0;

        // Clock
        this.clock = new THREE.Clock();

        // Subscribe to Global State (LocalStorage & Firebase)
        this.stateManager = bunnyGlobalState;
    }

    init() {
        this.createCanvas();
        this.initCornerCapsule();
        this.setupThreeScene();
        this.buildRabbitRoot();
        this.loadGLTFModel();
        this.bindEvents();
        this.listenToGlobalState();
        bunnyFirebaseSync.init();
        this.animate();
    }

    createCanvas() {
        if (document.getElementById('three-fullpage-rabbit-canvas')) {
            this.canvas = document.getElementById('three-fullpage-rabbit-canvas');
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.id = 'three-fullpage-rabbit-canvas';
        document.body.appendChild(canvas);
        this.canvas = canvas;
    }

    setupThreeScene() {
        this.scene = new THREE.Scene();

        const w = window.innerWidth;
        const h = window.innerHeight;
        const aspect = w / h;

        // Pure 2D Orthographic Parallel Camera (Zero perspective warp)
        const frustumH = 8.284;
        const frustumW = frustumH * aspect;
        this.camera = new THREE.OrthographicCamera(
            -frustumW / 2, frustumW / 2,
            frustumH / 2, -frustumH / 2,
            0.1, 100
        );
        this.camera.position.set(0, 0, 10);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true
        });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        window.addEventListener('resize', () => {
            const nw = window.innerWidth;
            const nh = window.innerHeight;
            const naspect = nw / nh;

            const nFrustumH = 8.284;
            const nFrustumW = nFrustumH * naspect;
            this.camera.left = -nFrustumW / 2;
            this.camera.right = nFrustumW / 2;
            this.camera.top = nFrustumH / 2;
            this.camera.bottom = -nFrustumH / 2;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(nw, nh);
            this.clampToBounds();
        });

        // Surface Desk Lighting: Warm, uniform daylight
        const ambientLight = new THREE.AmbientLight(0xfff7ed, 1.4);
        this.scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xffedd5, 1.3);
        keyLight.position.set(4, 8, 8);
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.7);
        fillLight.position.set(-6, -2, 6);
        this.scene.add(fillLight);
    }

    buildRabbitRoot() {
        this.bunnyRoot = new THREE.Group();
        this.bunnyRoot.position.set(0, 0, 0);
        this.scene.add(this.bunnyRoot);
        this.initShadow();
    }

    initShadow() {
        if (!this.bunnyRoot) return;
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 128;
        const ctx = c.getContext('2d');
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
        grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.28)');
        grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.08)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);

        const texture = new THREE.CanvasTexture(c);
        const geo = new THREE.PlaneGeometry(0.85, 0.85);
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.42,
            depthWrite: false
        });
        this.shadowMesh = new THREE.Mesh(geo, mat);
        this.shadowMesh.rotation.x = -Math.PI / 2;
        this.shadowMesh.position.y = -0.34;
        this.shadowMesh.raycast = () => {}; // Never intercept pointer raycasts
        this.bunnyRoot.add(this.shadowMesh);
    }

    screenToWorld(screenX, screenY) {
        const x = (screenX / window.innerWidth) * 2 - 1;
        const y = -(screenY / window.innerHeight) * 2 + 1;
        const vector = new THREE.Vector3(x, y, 0.5);
        vector.unproject(this.camera);
        return new THREE.Vector3(vector.x, vector.y, 0);
    }

    worldToScreen(worldPos) {
        const v = worldPos.clone().project(this.camera);
        return {
            x: ((v.x + 1) * window.innerWidth) / 2,
            y: ((-v.y + 1) * window.innerHeight) / 2
        };
    }

    /**
     * Hit test to detect sensitive parts on the rabbit (ears, head, scruff, body, tail, paws)
     * Combines exact 3D raycasting with a generous 65px proximity bubble for effortless holding.
     */
    getHitPart(clientX, clientY) {
        if (!this.bunnyRoot) return null;

        const screenX = this.pagePos.x;
        const screenY = this.pagePos.y - window.scrollY;
        const dx = clientX - screenX;
        const dy = clientY - screenY;
        const dist = Math.hypot(dx, dy);

        // 1. Precise 3D Mesh Raycasting
        if (this.raycaster && this.camera && this.gltfScene) {
            this.mouseVector.x = (clientX / window.innerWidth) * 2 - 1;
            this.mouseVector.y = -(clientY / window.innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.mouseVector, this.camera);
            const intersects = this.raycaster.intersectObjects(this.bunnyRoot.children, true);
            if (intersects.length > 0) {
                const hit = intersects[0];
                const hitObj = hit.object;

                // Check ancestry against rigged nodes
                const isDescendant = (parent) => {
                    if (!parent) return false;
                    let curr = hitObj;
                    while (curr && curr !== this.bunnyRoot) {
                        if (curr === parent) return true;
                        curr = curr.parent;
                    }
                    return false;
                };

                let part = 'scruff';
                if (this.gltfNodes) {
                    if (isDescendant(this.gltfNodes.earL) || isDescendant(this.gltfNodes.earR) || dy < -24) {
                        part = 'ears';
                    } else if (isDescendant(this.gltfNodes.tail) || (dy > 18 && dx > 10)) {
                        part = 'tail';
                    } else if (isDescendant(this.gltfNodes.muzzle) || isDescendant(this.gltfNodes.cheekL) || isDescendant(this.gltfNodes.cheekR) || dy < 0) {
                        part = 'head';
                    } else {
                        part = 'scruff';
                    }
                } else {
                    if (dy < -20) part = 'ears';
                    else if (dy < 2) part = 'head';
                    else if (dy > 18) part = 'tail';
                    else part = 'scruff';
                }

                return { part, mesh: hitObj, hitPoint: hit.point, isDirectHit: true, dist };
            }
        }

        // 2. Generous 2D proximity hit (~65px) so the bunny is effortlessly holdable anywhere on body
        if (dist < 65) {
            let part = 'scruff';
            if (dy < -22) part = 'ears';
            else if (dy < 2) part = 'head';
            else if (dy > 18) part = 'tail';
            return { part, mesh: null, isDirectHit: false, dist };
        }

        return null;
    }

    clampToBounds() {
        const minX = 70;
        const maxX = Math.max(minX, window.innerWidth - 75);
        const scrollY = window.scrollY || 0;
        const minY = scrollY + 70;
        const maxY = Math.max(minY, scrollY + window.innerHeight - 85);

        this.pagePos.x = Math.max(minX, Math.min(maxX, this.pagePos.x));
        this.pagePos.y = Math.max(minY, Math.min(maxY, this.pagePos.y));
    }

    clampTargetToBounds() {
        if (!this.targetPagePos) return;
        const minX = 70;
        const maxX = Math.max(minX, window.innerWidth - 75);
        const scrollY = window.scrollY || 0;
        const minY = scrollY + 70;
        const maxY = Math.max(minY, scrollY + window.innerHeight - 85);

        this.targetPagePos.x = Math.max(minX, Math.min(maxX, this.targetPagePos.x));
        this.targetPagePos.y = Math.max(minY, Math.min(maxY, this.targetPagePos.y));
    }

    evacuateToSafeCorner(cursorClientX) {
        if (this.isDragging || this.state === 'fainted' || this.stateManager.state.isDead) return;

        let targetX, targetY;
        const scrollY = window.scrollY || 0;
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        if (cursorClientX > winW / 2) {
            // User interacting on right half -> retreat to safe left margin
            targetX = 85;
            targetY = scrollY + Math.min(winH - 95, Math.max(130, winH * 0.75));
        } else {
            // User interacting on left half -> retreat to safe right margin (above corner capsule)
            targetX = winW - 85;
            targetY = scrollY + Math.min(winH - 150, Math.max(130, winH * 0.35));
        }

        const currentDist = Math.hypot(this.pagePos.x - targetX, this.pagePos.y - targetY);
        if (currentDist > 65) {
            this.targetPagePos = { x: targetX, y: targetY };
            this.clampTargetToBounds();
        }
    }

    loadGLTFModel() {
        if (typeof THREE.GLTFLoader === 'undefined') {
            console.warn('[BunnyCompanion] THREE.GLTFLoader not found.');
            return;
        }

        const loader = new THREE.GLTFLoader();
        const candidatePaths = [
            this.options.modelPath,
            'assets/rabbit.glb',
            'rabbit.glb',
            '../assets/rabbit.glb'
        ];

        const tryLoad = (idx) => {
            if (idx >= candidatePaths.length) return;
            loader.load(
                candidatePaths[idx],
                (gltf) => {
                    this.setupGLTFModel(gltf);
                },
                undefined,
                () => tryLoad(idx + 1)
            );
        };
        tryLoad(0);
    }

    setupGLTFModel(gltf) {
        if (this.gltfScene) {
            this.bunnyRoot.remove(this.gltfScene);
            this.gltfScene = null;
        }

        const model = gltf.scene;

        // Auto-normalize bounding box
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            const desiredSize = 0.90; // Proportional desktop scale
            const s = desiredSize / maxDim;
            model.scale.set(s, s, s);
            this.gltfBaseScale = s;
            model.position.x = -center.x * s;
            model.position.y = -box.min.y * s - 0.28;
            model.position.z = -center.z * s;
        }

        // Soft animal fur finish
        model.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.roughness = 0.95;
                child.material.metalness = 0.0;
                if (child.material.map) {
                    child.material.map.encoding = THREE.sRGBEncoding;
                    child.material.map.needsUpdate = true;
                }
            }
        });

        // Face forward toward viewer: 180 deg
        model.rotation.y = Math.PI;

        // 2D Top-Down Desk Pitch (~22 deg / 0.38 rad)
        model.rotation.x = 0.38;

        this.bunnyRoot.add(model);
        this.gltfScene = model;
        this.isGltfLoaded = true;

        // Bones & articulated nodes
        this.gltfNodes = {
            head: model.getObjectByName('head_14'),
            earL: model.getObjectByName('ear_left_13'),
            earR: model.getObjectByName('ear_right_11'),
            muzzle: model.getObjectByName('muzzle_7'),
            cheekL: model.getObjectByName('cheek_l_9'), // Left Eye
            cheekR: model.getObjectByName('cheek_r_8'), // Right Eye
            tail: model.getObjectByName('tail_4') || model.getObjectByName('tail_2'),
            torso: model.getObjectByName('torso_0') || model.getObjectByName('body_5'),
            legFrontR: model.getObjectByName('leg_front_right_17'),
            legFrontL: model.getObjectByName('leg_front_left_20'),
            footFrontR: model.getObjectByName('foot_front_r_16'),
            footFrontL: model.getObjectByName('foot_front_l_19'),
            legHindR: model.getObjectByName('leg_hind_right_24'),
            legHindL: model.getObjectByName('leg_hind_left_28'),
            footHindR: model.getObjectByName('foot_hind_r_23'),
            footHindL: model.getObjectByName('foot_hind_l_27')
        };

        // Whiskers
        if (this.gltfNodes.head) {
            const whiskerGroup = new THREE.Group();
            const whiskerMat = new THREE.LineBasicMaterial({
                color: 0x221714,
                transparent: true,
                opacity: 0.85
            });

            [-0.14, 0, 0.14].forEach((ang) => {
                const geo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(-0.06, 0.02, -0.22),
                    new THREE.Vector3(-0.26, 0.02 + Math.sin(ang) * 0.04, -0.28 + ang * 0.06)
                ]);
                whiskerGroup.add(new THREE.Line(geo, whiskerMat));
            });

            [-0.14, 0, 0.14].forEach((ang) => {
                const geo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0.06, 0.02, -0.22),
                    new THREE.Vector3(0.26, 0.02 + Math.sin(ang) * 0.04, -0.28 + ang * 0.06)
                ]);
                whiskerGroup.add(new THREE.Line(geo, whiskerMat));
            });

            this.gltfNodes.head.add(whiskerGroup);
            this.gltfWhiskers = whiskerGroup;
        }

        // Animation mixer
        this.animations = {};
        if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => {
                const act = this.mixer.clipAction(clip);
                act.setLoop(THREE.LoopRepeat);
                this.animations[clip.name.toLowerCase()] = act;
            });
            const walkClip = gltf.animations.find(c => c.name.toLowerCase() === 'walk') || gltf.animations[0];
            const runAction = this.mixer.clipAction(walkClip);
            runAction.setLoop(THREE.LoopRepeat);
            runAction.timeScale = 1.5;
            this.animations['run'] = runAction;
            this.animations['walk'] = runAction;
        }

        // Initialize state: Stop all mixer animations so paws remain calmly planted
        if (this.stateManager.state.isDead) {
            this.applyDeadPoseImmediate();
        } else {
            this.state = 'idle';
            this.stopAnimation();
        }
    }

    applyDeadPoseImmediate() {
        this.state = 'fainted';
        this.oxygenLevel = 0;

        // STOP all animation tracks immediately - hands and legs freeze completely
        if (this.mixer) {
            this.mixer.stopAllAction();
        }
        this.currentAction = null;

        if (this.gltfScene) {
            this.gltfScene.rotation.z = Math.PI / 2; // Flat on side
            this.gltfScene.rotation.x = 0.05;
            this.gltfScene.position.y = -0.36; // Settled flat on desk
        }

        // Relax all limbs and facial features to completely limp dead state
        if (this.gltfNodes) {
            // Limp hands and legs - zero movement
            if (this.gltfNodes.legFrontR) {
                this.gltfNodes.legFrontR.rotation.set(0, 0, 0);
                this.gltfNodes.legFrontR.position.set(0.09375, 0.25, -0.3);
            }
            if (this.gltfNodes.legFrontL) {
                this.gltfNodes.legFrontL.rotation.set(0, 0, 0);
                this.gltfNodes.legFrontL.position.set(-0.09375, 0.25, -0.3);
            }
            if (this.gltfNodes.footFrontR) this.gltfNodes.footFrontR.rotation.set(0, 0, 0);
            if (this.gltfNodes.footFrontL) this.gltfNodes.footFrontL.rotation.set(0, 0, 0);
            if (this.gltfNodes.legHindR) {
                this.gltfNodes.legHindR.rotation.set(0, 0, 0);
                this.gltfNodes.legHindR.position.set(0.171875, 0.28125, 0);
            }
            if (this.gltfNodes.legHindL) {
                this.gltfNodes.legHindL.rotation.set(0, 0, 0);
                this.gltfNodes.legHindL.position.set(-0.171875, 0.28125, 0);
            }
            if (this.gltfNodes.footHindR) this.gltfNodes.footHindR.rotation.set(0, 0, 0);
            if (this.gltfNodes.footHindL) this.gltfNodes.footHindL.rotation.set(0, 0, 0);

            // Head and ears limp
            if (this.gltfNodes.head) this.gltfNodes.head.rotation.set(-0.2, 0, 0);
            if (this.gltfNodes.earL) this.gltfNodes.earL.rotation.set(0, 0, -0.7);
            if (this.gltfNodes.earR) this.gltfNodes.earR.rotation.set(0, 0, -0.5);

            // Eyes closed flatline
            if (this.gltfNodes.cheekL) this.gltfNodes.cheekL.scale.set(1.0, 0.05, 1.0);
            if (this.gltfNodes.cheekR) this.gltfNodes.cheekR.scale.set(1.0, 0.05, 1.0);

            // Muzzle still
            if (this.gltfNodes.muzzle) {
                this.gltfNodes.muzzle.position.set(0, 0, -0.231);
                this.gltfNodes.muzzle.scale.set(1.0, 1.0, 1.0);
            }
        }

        this.updateCornerCapsule(0, 0, false);
    }

    playAnimation(name) {
        if (!this.mixer) return;
        const action = this.animations[name] || this.animations['run'] || this.animations['walk'];
        if (!action) return;

        if (this.currentAction === action && action.isRunning()) return;

        if (this.currentAction && this.currentAction !== action) {
            this.currentAction.stop();
        }
        action.reset().play();
        this.currentAction = action;
    }

    stopAnimation() {
        if (this.mixer) {
            this.mixer.stopAllAction();
        }
        this.currentAction = null;
        if (this.gltfNodes) {
            if (this.gltfNodes.legFrontR) {
                this.gltfNodes.legFrontR.rotation.set(0, 0, 0);
                this.gltfNodes.legFrontR.position.set(0.09375, 0.25, -0.3);
            }
            if (this.gltfNodes.legFrontL) {
                this.gltfNodes.legFrontL.rotation.set(0, 0, 0);
                this.gltfNodes.legFrontL.position.set(-0.09375, 0.25, -0.3);
            }
            if (this.gltfNodes.footFrontR) this.gltfNodes.footFrontR.rotation.set(0, 0, 0);
            if (this.gltfNodes.footFrontL) this.gltfNodes.footFrontL.rotation.set(0, 0, 0);
            if (this.gltfNodes.legHindR) {
                this.gltfNodes.legHindR.rotation.set(0, 0, 0);
                this.gltfNodes.legHindR.position.set(0.171875, 0.28125, 0);
            }
            if (this.gltfNodes.legHindL) {
                this.gltfNodes.legHindL.rotation.set(0, 0, 0);
                this.gltfNodes.legHindL.position.set(-0.171875, 0.28125, 0);
            }
            if (this.gltfNodes.footHindR) this.gltfNodes.footHindR.rotation.set(0, 0, 0);
            if (this.gltfNodes.footHindL) this.gltfNodes.footHindL.rotation.set(0, 0, 0);
        }
    }

    // --- UI: Apple Live Activity Capsule & Apple Watch Vitals Card ---
    initCornerCapsule() {
        if (document.getElementById('bunny-corner-capsule')) return;

        const capsule = document.createElement('div');
        capsule.id = 'bunny-corner-capsule';

        capsule.innerHTML = `
            <!-- The Apple Watch Vitals Card (Expanded View) -->
            <div class="bunny-drawer" id="bunny-drawer">
                <div class="bunny-drawer-header">
                    <div class="bunny-drawer-title-group">
                        <div class="bunny-drawer-title">
                            <span>🐰 Blinky Vitals</span>
                        </div>
                        <span id="drawer-vitals-badge" class="bunny-drawer-vitals-badge">TYPICAL RANGE</span>
                    </div>
                    <div class="bunny-drawer-controls">
                        <button class="bunny-icon-btn" id="btn-toggle-sound" title="Toggle Beep Audio">🔊</button>
                        <button class="bunny-icon-btn" id="btn-toggle-sleep" title="Snooze / Wake Blinky">💤</button>
                        <button class="bunny-drawer-close" id="btn-close-drawer" title="Close drawer">✕</button>
                    </div>
                </div>

                <!-- Apple ECG Oscilloscope Waveform -->
                <div class="bunny-ekg-row">
                    <canvas id="capsule-ekg-canvas" width="140" height="32"></canvas>
                    <div class="bunny-ekg-meta">
                        <div class="bunny-ekg-bpm-readout" id="drawer-bpm-readout">
                            <span id="drawer-bpm-val">140</span>
                            <span>BPM</span>
                        </div>
                        <div class="bunny-ekg-rhythm" id="drawer-rhythm-text">SINUS RHYTHM</div>
                    </div>
                </div>

                <!-- Dual Apple Health Metric Cards -->
                <div class="bunny-stats-grid">
                    <div class="bunny-stat-card">
                        <div class="bunny-stat-label">❤️ Resting Heart Rate</div>
                        <div class="bunny-stat-val" id="drawer-health-val">140 BPM</div>
                        <div class="bunny-stat-meta" id="drawer-health-meta">In typical range</div>
                    </div>
                    <div class="bunny-stat-card">
                        <div class="bunny-stat-label">🫁 Blood Oxygen</div>
                        <div class="bunny-stat-val" id="drawer-spo2-val">99% SpO₂</div>
                        <div class="bunny-stat-meta" id="drawer-spo2-meta">Optimal oxygenation</div>
                    </div>
                </div>

                <!-- Drawer Actions: Apple High-Contrast Pill -->
                <div class="bunny-drawer-actions">
                    <button class="bunny-apple-action-btn" id="btn-drawer-feed">
                        <span>🥕 Treat with Fresh Carrot</span>
                    </button>

                    <!-- Rest & Recovery State Notice Box -->
                    <div id="drawer-death-actions" class="bunny-recovery-card" style="display: none;">
                        <div class="bunny-recovery-title">💤 Restorative Power Nap</div>
                        <div class="bunny-recovery-desc">Blinky was held a bit too long and is resting peacefully. Tap him on the desk or offer a carrot to wake him.</div>
                        <button class="bunny-btn-wake-action" id="btn-drawer-revive-carrot">
                            <span>🥕 Wake Blinky</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- The Corner Capsule Pill (Apple Live Activity) -->
            <div class="bunny-capsule-pill" id="bunny-pill">
                <div class="bunny-status-orb-container">
                    <div class="bunny-status-halo" id="bunny-status-halo"></div>
                    <div class="bunny-status-orb" id="bunny-pill-orb"></div>
                </div>
                <div class="bunny-capsule-icon">🐰</div>
                <div class="bunny-capsule-info">
                    <div class="bunny-capsule-title">
                        <span>Blinky</span>
                        <span id="bunny-pill-status" class="bunny-pill-badge">Optimal</span>
                    </div>
                    <div class="bunny-capsule-subtitle" id="bunny-pill-stats">99% O₂ • 140 BPM</div>
                </div>
                <button class="bunny-pill-wake-btn" id="btn-pill-wake" style="display: none;" title="Wake Blinky">
                    <span>☀️ Wake</span>
                </button>
                <div class="bunny-capsule-chevron">▲</div>
            </div>
        `;

        document.body.appendChild(capsule);
        this.cornerCapsuleEl = capsule;
        this.ekgCanvas = document.getElementById('capsule-ekg-canvas');
        if (this.ekgCanvas) this.ekgCtx = this.ekgCanvas.getContext('2d');

        // Toggle drawer
        const pill = document.getElementById('bunny-pill');
        pill.addEventListener('click', (e) => {
            if (e.target.closest('#btn-pill-wake')) return;
            capsule.classList.toggle('expanded');
        });

        document.getElementById('btn-close-drawer').addEventListener('click', () => {
            capsule.classList.remove('expanded');
        });

        // Quick Wake from Pill
        document.getElementById('btn-pill-wake').addEventListener('click', (e) => {
            e.stopPropagation();
            this.reviveBunny();
            this.spawnFloatingHeart('☀️');
        });

        // Sound Toggle
        const btnSound = document.getElementById('btn-toggle-sound');
        btnSound.addEventListener('click', (e) => {
            e.stopPropagation();
            const isMuted = this.stateManager.toggleMute();
            btnSound.textContent = isMuted ? '🔇' : '🔊';
            btnSound.title = isMuted ? 'Unmute Audio' : 'Mute Audio';
        });

        // Sleep / Snooze Toggle
        const btnSleep = document.getElementById('btn-toggle-sleep');
        btnSleep.addEventListener('click', (e) => {
            e.stopPropagation();
            const isSleeping = this.stateManager.toggleSleep();
            btnSleep.textContent = isSleeping ? '☀️' : '💤';
            btnSleep.title = isSleeping ? 'Wake Blinky' : 'Snooze Blinky';
            btnSleep.classList.toggle('active', isSleeping);
            if (isSleeping) {
                this.spawnFloatingHeart('💤');
            } else {
                this.reviveBunny();
                this.spawnFloatingHeart('☀️');
            }
        });

        // Feed Carrot in Drawer
        document.getElementById('btn-drawer-feed').addEventListener('click', (e) => {
            e.stopPropagation();
            this.feedCarrot();
        });

        // Wake / Revive in Drawer
        document.getElementById('btn-drawer-revive-carrot').addEventListener('click', (e) => {
            e.stopPropagation();
            this.feedCarrot();
        });
    }

    openCapsuleDrawer() {
        if (this.cornerCapsuleEl) {
            this.cornerCapsuleEl.classList.add('expanded');
        }
    }

    updateCornerCapsule(spo2, bpm, isChoking) {
        if (!this.cornerCapsuleEl) return;
        const st = this.stateManager.state;
        const orb = document.getElementById('bunny-pill-orb');
        const statusBadge = document.getElementById('bunny-pill-status');
        const statsPill = document.getElementById('bunny-pill-stats');
        const spo2El = document.getElementById('drawer-spo2-val');
        const bpmEl = document.getElementById('drawer-bpm-val');
        const healthEl = document.getElementById('drawer-health-val');
        const healthMeta = document.getElementById('drawer-health-meta');
        const vitalsBadge = document.getElementById('drawer-vitals-badge');
        const rhythmText = document.getElementById('drawer-rhythm-text');
        const deathBox = document.getElementById('drawer-death-actions');
        const feedBtn = document.getElementById('btn-drawer-feed');
        const wakeBtn = document.getElementById('btn-pill-wake');

        const spo2Rounded = Math.round(spo2);
        const bpmRounded = Math.round(bpm);

        if (spo2El) spo2El.textContent = `${spo2Rounded}% SpO₂`;
        if (bpmEl) bpmEl.textContent = `${bpmRounded}`;

        if (orb) {
            orb.className = 'bunny-status-orb';
            if (st.isDead) orb.classList.add('resting');
            else if (st.isSleeping) orb.classList.add('sleeping');
            else if (isChoking) orb.classList.add('resting');
            else if (st.isSick) orb.classList.add('resting');
        }

        if (st.isDead || this.state === 'fainted') {
            if (statusBadge) {
                statusBadge.textContent = 'Power Nap 💤';
                statusBadge.className = 'bunny-pill-badge resting';
            }
            if (statsPill) {
                statsPill.textContent = 'Resting • Tap to wake';
            }
            if (healthEl) healthEl.textContent = '40 BPM';
            if (healthMeta) healthMeta.textContent = 'Restorative sleep';
            if (vitalsBadge) {
                vitalsBadge.textContent = 'RESTING';
                vitalsBadge.style.color = '#ffd60a';
                vitalsBadge.style.borderColor = 'rgba(255, 214, 10, 0.4)';
                vitalsBadge.style.background = 'rgba(255, 214, 10, 0.12)';
            }
            if (rhythmText) rhythmText.textContent = 'DEEP REST';
            if (deathBox) deathBox.style.display = 'flex';
            if (feedBtn) feedBtn.style.display = 'none';
            if (wakeBtn) wakeBtn.style.display = 'inline-flex';
        } else if (st.isSleeping) {
            if (statusBadge) {
                statusBadge.textContent = 'Snoozing 💤';
                statusBadge.className = 'bunny-pill-badge sleeping';
            }
            if (statsPill) {
                statsPill.textContent = `💤 Snoozing • ${bpmRounded} BPM`;
            }
            if (healthEl) healthEl.textContent = `${bpmRounded} BPM`;
            if (healthMeta) healthMeta.textContent = 'Peaceful snooze';
            if (vitalsBadge) {
                vitalsBadge.textContent = 'SNOOZING';
                vitalsBadge.style.color = '#bf5af2';
                vitalsBadge.style.borderColor = 'rgba(191, 90, 242, 0.4)';
                vitalsBadge.style.background = 'rgba(191, 90, 242, 0.12)';
            }
            if (rhythmText) rhythmText.textContent = 'RESTING RHYTHM';
            if (deathBox) deathBox.style.display = 'none';
            if (feedBtn) feedBtn.style.display = 'inline-flex';
            if (wakeBtn) wakeBtn.style.display = 'inline-flex';
        } else {
            if (deathBox) deathBox.style.display = 'none';
            if (feedBtn) feedBtn.style.display = 'inline-flex';
            if (wakeBtn) wakeBtn.style.display = 'none';

            if (isChoking) {
                if (statusBadge) {
                    statusBadge.textContent = 'Fatigued 🥱';
                    statusBadge.className = 'bunny-pill-badge resting';
                }
                if (statsPill) {
                    statsPill.textContent = `${spo2Rounded}% O₂ • ${bpmRounded} BPM`;
                }
                if (healthEl) healthEl.textContent = `${bpmRounded} BPM`;
                if (healthMeta) healthMeta.textContent = 'Needs release';
                if (vitalsBadge) {
                    vitalsBadge.textContent = 'ELEVATED';
                    vitalsBadge.style.color = '#ffd60a';
                    vitalsBadge.style.borderColor = 'rgba(255, 214, 10, 0.4)';
                    vitalsBadge.style.background = 'rgba(255, 214, 10, 0.12)';
                }
                if (rhythmText) rhythmText.textContent = 'EXERTION';
            } else {
                if (statusBadge) {
                    statusBadge.textContent = st.isSick ? 'Low Energy 💫' : 'Optimal ✨';
                    statusBadge.className = st.isSick ? 'bunny-pill-badge resting' : 'bunny-pill-badge';
                }
                if (statsPill) {
                    statsPill.textContent = `${spo2Rounded}% O₂ • ${bpmRounded} BPM`;
                }
                if (healthEl) healthEl.textContent = `${bpmRounded} BPM`;
                if (healthMeta) healthMeta.textContent = 'In typical range';
                if (vitalsBadge) {
                    vitalsBadge.textContent = 'TYPICAL RANGE';
                    vitalsBadge.style.color = '#30d158';
                    vitalsBadge.style.borderColor = 'rgba(48, 209, 88, 0.35)';
                    vitalsBadge.style.background = 'rgba(48, 209, 88, 0.15)';
                }
                if (rhythmText) rhythmText.textContent = 'SINUS RHYTHM';
            }
        }
    }

    drawEKGWave(delta) {
        if (!this.ekgCtx || !this.ekgCanvas) return;
        const ctx = this.ekgCtx;
        const w = this.ekgCanvas.width;
        const h = this.ekgCanvas.height;
        const midY = h / 2;

        const isDead = this.stateManager.state.isDead || (this.state === 'fainted');

        // Measured clinical scroll speed (~45px per second for clear, readable sweep)
        const scrollSpeed = 45;
        const pixelsToAdvance = Math.max(1, Math.round(scrollSpeed * delta * 1.4));

        if (isDead) {
            // Flatline: scroll flat baseline
            for (let i = 0; i < pixelsToAdvance; i++) {
                this.ekgBuffer.copyWithin(0, 1);
                this.ekgBuffer[w - 1] = midY;
            }
        } else {
            // Heartbeat duration based on current heartRate with subtle natural sinus arrhythmia
            const baseInterval = (60 / this.heartRate);
            const beatInterval = baseInterval * (this.currentBeatParams.sinusArrhythmia || 1.0);

            for (let i = 0; i < pixelsToAdvance; i++) {
                const dt = delta / pixelsToAdvance;
                this.ekgBeatTimer += dt;

                const phase = this.ekgBeatTimer / beatInterval;
                let sampleY = midY;
                const noise = (Math.random() - 0.5) * 0.45; // Subtle electrical baseline hiss

                if (phase < 0.12) {
                    // Baseline
                    sampleY = midY + noise;
                } else if (phase < 0.22) {
                    // P wave (atrial depolarization)
                    const p = (phase - 0.12) / 0.10;
                    sampleY = midY - Math.sin(p * Math.PI) * this.currentBeatParams.pHeight + noise;
                } else if (phase < 0.28) {
                    // PR segment
                    sampleY = midY + noise;
                } else if (phase < 0.32) {
                    // Q wave (initial dip / minor town)
                    const q = (phase - 0.28) / 0.04;
                    sampleY = midY + Math.sin(q * Math.PI) * this.currentBeatParams.qDepth;
                } else if (phase < 0.40) {
                    // R wave (THE PIKE! Sharp systolic spike upward)
                    const r = (phase - 0.32) / 0.08;
                    sampleY = midY - Math.sin(r * Math.PI) * this.currentBeatParams.rHeight;
                } else if (phase < 0.46) {
                    // S wave (DEEP TOWN / valley downward)
                    const s = (phase - 0.40) / 0.06;
                    sampleY = midY + Math.sin(s * Math.PI) * this.currentBeatParams.sDepth;
                } else if (phase < 0.54) {
                    // ST segment
                    sampleY = midY + noise;
                } else if (phase < 0.70) {
                    // T wave (ventricular repolarization dome)
                    const t = (phase - 0.54) / 0.16;
                    sampleY = midY - Math.sin(t * Math.PI) * this.currentBeatParams.tHeight + noise;
                } else {
                    // TP interval (diastolic rest)
                    sampleY = midY + noise;
                }

                // Scroll buffer left by 1px and push newest sample
                this.ekgBuffer.copyWithin(0, 1);
                this.ekgBuffer[w - 1] = sampleY;

                // When current beat completes, generate random pike and town parameters for next beat!
                if (this.ekgBeatTimer >= beatInterval) {
                    this.ekgBeatTimer = 0;
                    const isExtraPike = Math.random() < 0.28; // Occasional extra energetic pike
                    this.currentBeatParams = {
                        pHeight: 1.8 + Math.random() * 0.9,
                        qDepth: 1.8 + Math.random() * 2.2, // Random minor town (dip)
                        rHeight: isExtraPike ? (13.5 + Math.random() * 1.5) : (9.5 + Math.random() * 3.2), // Random pike (spike)
                        sDepth: 4.8 + Math.random() * 3.4, // Random deep town (valley)
                        tHeight: 2.2 + Math.random() * 1.6,
                        sinusArrhythmia: 0.93 + Math.random() * 0.14 // Natural physiological variation
                    };
                }
            }
        }

        // Dark oscilloscope phosphor background
        ctx.fillStyle = 'rgba(10, 15, 29, 0.55)';
        ctx.fillRect(0, 0, w, h);

        // Grid lines (subtle medical ECG monitor grid)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY); ctx.lineTo(w, midY);
        for (let gx = 28; gx < w; gx += 28) {
            ctx.moveTo(gx, 0); ctx.lineTo(gx, h);
        }
        ctx.stroke();

        // Neon Glow Trace — Apple Health Green / Amber
        const strokeColor = isDead ? '#ffd60a' : (this.oxygenLevel < 60 ? '#ffd60a' : '#30d158');
        ctx.strokeStyle = strokeColor;
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 4;
        ctx.lineWidth = 1.7;

        ctx.beginPath();
        for (let x = 0; x < w; x++) {
            const y = this.ekgBuffer[x];
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset
    }

    initAudio() {
        if (this.audioCtx) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioCtx = new AudioContext();
            }
        } catch (_) { }
    }

    playPulseBeep() {
        if (this.stateManager.state.isMuted) return;
        if (!this.audioCtx) this.initAudio();
        if (!this.audioCtx) return;
        try {
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            // Apple Watch Subtle Sine Haptic Tap
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'sine';
            const baseFreq = 440;
            osc.frequency.setValueAtTime(baseFreq, this.audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(390, this.audioCtx.currentTime + 0.045);
            gain.gain.setValueAtTime(0.022, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.045);
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.045);
        } catch (_) { }
    }

    playMunchSound() {
        if (this.stateManager.state.isMuted) return;
        if (!this.audioCtx) this.initAudio();
        if (!this.audioCtx) return;
        try {
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            // Apple Pay / AirDrop Melodic Two-Tone Chime (C5 -> E5)
            const notes = [523.25, 659.25];
            notes.forEach((freq, idx) => {
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                osc.type = 'sine';
                const startTime = this.audioCtx.currentTime + idx * 0.07;
                osc.frequency.setValueAtTime(freq, startTime);
                gain.gain.setValueAtTime(0.035, startTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.16);
                osc.connect(gain);
                gain.connect(this.audioCtx.destination);
                osc.start(startTime);
                osc.stop(startTime + 0.16);
            });
        } catch (_) { }
    }

    playWakeChime() {
        if (this.stateManager.state.isMuted) return;
        if (!this.audioCtx) this.initAudio();
        if (!this.audioCtx) return;
        try {
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            // Apple Ascending Triad Wake Chime (C5 -> E5 -> G5)
            const notes = [523.25, 659.25, 783.99];
            notes.forEach((freq, idx) => {
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                osc.type = 'sine';
                const startTime = this.audioCtx.currentTime + idx * 0.08;
                osc.frequency.setValueAtTime(freq, startTime);
                gain.gain.setValueAtTime(0.03, startTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);
                osc.connect(gain);
                gain.connect(this.audioCtx.destination);
                osc.start(startTime);
                osc.stop(startTime + 0.22);
            });
        } catch (_) { }
    }

    faintFromChoking() {
        this.state = 'fainted';
        this.isDragging = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        this.dangleAngle = 0;
        this.dangleVel = 0;

        // STOP all animation tracks
        if (this.mixer) {
            this.mixer.stopAllAction();
        }

        this.stateManager.setDead(true);
        this.applyDeadPoseImmediate();
    }

    reviveBunny() {
        this.state = 'idle';
        this.oxygenLevel = 100;
        this.heartRate = 140;

        if (this.gltfScene) {
            this.gltfScene.rotation.z = 0;
            this.gltfScene.rotation.x = 0.38;
            this.gltfScene.position.y = -0.28;
            this.bunnyRoot.rotation.z = 0;
            this.bunnyRoot.rotation.y = 0;
        }

        if (this.gltfNodes) {
            if (this.gltfNodes.head) this.gltfNodes.head.rotation.set(0, 0, 0);
            if (this.gltfNodes.earL) this.gltfNodes.earL.rotation.set(0, 0, 0);
            if (this.gltfNodes.earR) this.gltfNodes.earR.rotation.set(0, 0, 0);
            if (this.gltfNodes.cheekL) this.gltfNodes.cheekL.scale.set(1, 1, 1);
            if (this.gltfNodes.cheekR) this.gltfNodes.cheekR.scale.set(1, 1, 1);
            if (this.gltfNodes.legFrontR) {
                this.gltfNodes.legFrontR.rotation.set(0, 0, 0);
                this.gltfNodes.legFrontR.position.set(0.09375, 0.25, -0.3);
            }
            if (this.gltfNodes.legFrontL) {
                this.gltfNodes.legFrontL.rotation.set(0, 0, 0);
                this.gltfNodes.legFrontL.position.set(-0.09375, 0.25, -0.3);
            }
            if (this.gltfNodes.footFrontR) this.gltfNodes.footFrontR.rotation.set(0, 0, 0);
            if (this.gltfNodes.footFrontL) this.gltfNodes.footFrontL.rotation.set(0, 0, 0);
            if (this.gltfNodes.legHindR) {
                this.gltfNodes.legHindR.rotation.set(0, 0, 0);
                this.gltfNodes.legHindR.position.set(0.171875, 0.28125, 0);
            }
            if (this.gltfNodes.legHindL) {
                this.gltfNodes.legHindL.rotation.set(0, 0, 0);
                this.gltfNodes.legHindL.position.set(-0.171875, 0.28125, 0);
            }
            if (this.gltfNodes.footHindR) this.gltfNodes.footHindR.rotation.set(0, 0, 0);
            if (this.gltfNodes.footHindL) this.gltfNodes.footHindL.rotation.set(0, 0, 0);
        }

        // Stop any running animations
        this.stopAnimation();

        // Bounce back with landing squash cushion
        this.landingSquash = 0.24;
        this.landingSquashVel = -3.5;

        this.playWakeChime();
        this.spawnFloatingHeart('✨');
        this.updateCornerCapsule(100, 140, false);
    }

    feedCarrot() {
        this.stateManager.recordCarrotEaten();
        this.spawnFloatingCarrot();
        this.playMunchSound();

        if (this.state === 'fainted' || this.stateManager.state.isDead) {
            this.reviveBunny();
        } else {
            this.landingSquash = 0.16;
            this.landingSquashVel = -2.2;
            this.spawnFloatingHeart('❤️');
            if (this.gltfNodes && this.gltfNodes.muzzle) {
                this.gltfNodes.muzzle.scale.set(1.15, 1.15, 1.0);
            }
        }
    }

    spawnFloatingCarrot() {
        const carrot = document.createElement('div');
        carrot.className = 'rabbit-floating-carrot';
        carrot.textContent = '🥕';
        const screenX = this.pagePos.x;
        const screenY = this.pagePos.y - window.scrollY;
        carrot.style.left = `${screenX + 8}px`;
        carrot.style.top = `${screenY - 28}px`;
        document.body.appendChild(carrot);
        setTimeout(() => carrot.remove(), 1100);
    }

    spawnFloatingHeart(symbol = '❤️') {
        const heart = document.createElement('div');
        heart.className = 'rabbit-floating-heart';
        heart.textContent = symbol;
        const screenX = this.pagePos.x;
        const screenY = this.pagePos.y - window.scrollY;
        heart.style.left = `${screenX + 8}px`;
        heart.style.top = `${screenY - 24}px`;
        document.body.appendChild(heart);
        setTimeout(() => heart.remove(), 1100);
    }

    bindEvents() {
        // --- 1. Screen & Window Awareness & Energy Saver ---
        document.addEventListener('visibilitychange', () => {
            this.isTabHidden = document.hidden;
            if (document.hidden) {
                if (this.audioCtx && this.audioCtx.state === 'running') {
                    this.audioCtx.suspend();
                }
            } else {
                this.clock.getDelta(); // Clear accumulated delta
            }
        });

        document.addEventListener('mouseleave', () => {
            this.isUserOnScreen = false;
        });

        document.addEventListener('mouseenter', () => {
            this.isUserOnScreen = true;
            this.lastUserActivityTime = performance.now();
        });

        window.addEventListener('blur', () => {
            this.isUserOnScreen = false;
        });

        window.addEventListener('focus', () => {
            this.isUserOnScreen = true;
            this.lastUserActivityTime = performance.now();
        });

        window.addEventListener('scroll', () => {
            this.lastUserActivityTime = performance.now();
            this.clampToBounds();
        }, { passive: true });

        // --- 2. Pointer Down (Holding & Sensitive Parts Dragging) ---
        window.addEventListener('pointerdown', (e) => {
            const hit = this.getHitPart(e.clientX, e.clientY);

            if (hit) {
                // Clicking on rabbit while dead / fainted wakes him with carrot!
                if (this.state === 'fainted' || this.stateManager.state.isDead) {
                    this.feedCarrot();
                    return;
                }

                // Clicking on rabbit while snoozing wakes him up!
                if (this.stateManager.state.isSleeping) {
                    this.stateManager.toggleSleep();
                    this.spawnFloatingHeart('☀️');
                    return;
                }

                this.initAudio();

                if (e.pointerType === 'mouse' || hit.isDirectHit) {
                    this.startDragging(e, hit);
                    e.preventDefault();
                } else {
                    // Touch screen proximity tap: prime drag without hijacking page scroll
                    this.touchStartX = e.clientX;
                    this.touchStartY = e.clientY;
                    this.isTouchPrimed = true;
                    this.primedHit = hit;
                }
                return;
            }

            // User clicked elsewhere on interactive content (e.g. typing into inputs)
            const target = e.target;
            if (target && target.closest('input, textarea, select')) {
                this.isUserInteracting = true;
                this.lastUserInteractingTime = performance.now();
            }
        });

        // --- 3. Pointer Move (Exploration, Sensitive Touch & Content Awareness) ---
        window.addEventListener('pointermove', (e) => {
            this.isUserOnScreen = true;
            this.hasUserMovedPointer = true;
            this.lastUserActivityTime = performance.now();

            // Mobile touch drag threshold check (~12px hysteresis)
            if (this.isTouchPrimed && !this.isDragging) {
                const dx = e.clientX - this.touchStartX;
                const dy = e.clientY - this.touchStartY;
                if (Math.hypot(dx, dy) > 12) {
                    this.startDragging(e, this.primedHit);
                    this.isTouchPrimed = false;
                    this.primedHit = null;
                }
            }

            if (this.isDragging) {
                this.pagePos.x = e.pageX + this.dragOffset.x;
                this.pagePos.y = e.pageY + this.dragOffset.y;
                this.clampToBounds();
                this.dragVelocityX = e.movementX || 0;
                return;
            }

            // Tactile hover feedback & sensitive parts detection
            const hit = this.getHitPart(e.clientX, e.clientY);
            if (hit) {
                this.hoveredPart = hit.part;
                this.isTouching = true;
                document.body.style.cursor = (this.state === 'fainted' || this.stateManager.state.isDead) ? 'pointer' : 'grab';
            } else {
                this.hoveredPart = null;
                this.isTouching = false;
                if (document.body.style.cursor === 'grab' || document.body.style.cursor === 'pointer') {
                    document.body.style.cursor = '';
                }
            }

            // Save pointer position for gentle head glancing & petting
            this.lastKnownPointer = {
                x: e.pageX,
                y: e.pageY,
                time: performance.now()
            };

            if (this.isUserInteracting && (performance.now() - this.lastUserInteractingTime > 1800)) {
                this.isUserInteracting = false;
            }
        }, { passive: false });

        // --- 4. Pointer Up (Release from Drag) ---
        window.addEventListener('pointerup', () => {
            this.isTouchPrimed = false;
            this.primedHit = null;

            if (this.isDragging) {
                this.isDragging = false;
                this.heldPart = null;
                this.clampToBounds();
                document.body.style.userSelect = '';
                document.body.style.cursor = '';

                if (this.state !== 'fainted') {
                    // Physical landing squash-and-stretch cushion
                    this.landingSquash = 0.22;
                    this.landingSquashVel = -3.2;
                    if (navigator.vibrate) {
                        try { navigator.vibrate(14); } catch (_) {}
                    }

                    if (this.gltfScene) {
                        this.gltfScene.rotation.z = 0;
                        this.gltfScene.rotation.x = 0.38;
                    }
                    if (this.oxygenLevel < 95) {
                        this.state = 'pant';
                        this.pantStartTime = performance.now();
                        this.stopAnimation();
                    } else {
                        this.state = 'idle';
                        this.stopAnimation();
                    }
                    this.lastKnownPointer = { x: this.pagePos.x, y: this.pagePos.y, time: performance.now() };
                }
                this.lastDragEndTime = performance.now();
            }
        });
    }

    startDragging(e, hit) {
        this.isDragging = true;
        this.heldPart = hit ? hit.part : 'scruff';
        this.targetPagePos = null;
        this.isHopping = false;
        this.isBackflipping = false;
        this.dragOffset = { x: this.pagePos.x - e.pageX, y: this.pagePos.y - e.pageY };
        this.dragVelocityX = 0;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        this.state = 'held';
        this.playAnimation('run');
    }

    listenToGlobalState() {
        this.stateManager.subscribe((st) => {
            if (st.isDead) {
                if (this.state !== 'fainted') {
                    this.applyDeadPoseImmediate();
                }
            } else {
                if (this.state === 'fainted') {
                    this.reviveBunny();
                }
            }
            this.updateCornerCapsule(this.oxygenLevel, this.heartRate, false);
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Respect battery: skip render loop when tab is hidden
        if (this.isTabHidden) {
            return;
        }

        const delta = Math.min(this.clock.getDelta(), 0.1);
        const time = this.clock.getElapsedTime();
        const now = performance.now();

        // Update mixer when active in air while being held
        if (this.mixer && this.isDragging) {
            this.mixer.update(delta);
        }

        // Squash-and-stretch landing cushion spring physics
        if (Math.abs(this.landingSquash) > 0.001 || Math.abs(this.landingSquashVel) > 0.001) {
            const squashK = 180.0;
            const squashDamping = 14.0;
            const squashAccel = -squashK * this.landingSquash - squashDamping * this.landingSquashVel;
            this.landingSquashVel += squashAccel * delta;
            this.landingSquash += this.landingSquashVel * delta;
        } else {
            this.landingSquash = 0;
            this.landingSquashVel = 0;
        }

        // --- Safe-Distance Pointer Following Controller ---
        // When user is exploring or moving pointer in open space, rabbit follows along
        // while maintaining a polite, respectful safe distance (~120px)
        if (
            this.isUserOnScreen &&
            this.hasUserMovedPointer &&
            !this.isUserInteracting &&
            !this.isBackflipping &&
            !this.isDragging &&
            this.state !== 'fainted' &&
            !this.stateManager.state.isDead &&
            !this.stateManager.state.isSleeping
        ) {
            const distToCursor = Math.hypot(this.lastKnownPointer.x - this.pagePos.x, this.lastKnownPointer.y - this.pagePos.y);

            if (distToCursor > 165) {
                // Pointer is far away: track when it moved away and wait 3-4 seconds before following
                if (!this.cursorAwayStartTime) {
                    this.cursorAwayStartTime = now;
                    this.followDelay = 3000 + Math.random() * 1000; // 3 to 4 seconds delay
                }

                // Only start hopping over after 3-4 seconds of cursor being away
                if (now - this.cursorAwayStartTime >= this.followDelay) {
                    const angle = Math.atan2(this.pagePos.y - this.lastKnownPointer.y, this.pagePos.x - this.lastKnownPointer.x);
                    const targetX = this.lastKnownPointer.x + Math.cos(angle) * this.safeDistance;
                    const targetY = this.lastKnownPointer.y + Math.sin(angle) * this.safeDistance;
                    this.targetPagePos = { x: targetX, y: targetY };
                    this.clampTargetToBounds();
                }
            } else {
                // Pointer returned within comfortable range: reset delay timer & allow cursor to touch him freely!
                this.cursorAwayStartTime = 0;

                // If rabbit was hopping towards a distant point, but pointer returned close, settle down peacefully
                if (this.targetPagePos) {
                    this.targetPagePos = null;
                    this.isHopping = false;
                    this.stopAnimation();
                }
            }
        }

        // Polite Safe Distance Relocation (Episodic, Natural Rabbit Locomotion)
        if (this.targetPagePos && !this.isDragging && this.state !== 'fainted' && !this.stateManager.state.isDead && !this.stateManager.state.isSleeping) {
            const dx = this.targetPagePos.x - this.pagePos.x;
            const dy = this.targetPagePos.y - this.pagePos.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 12) {
                this.pagePos.x = this.targetPagePos.x;
                this.pagePos.y = this.targetPagePos.y;
                this.targetPagePos = null;
                this.isHopping = false;
                this.cursorAwayStartTime = 0;
                this.stopAnimation();
            } else {
                this.isHopping = true;

                // Episodic, rhythmic rabbit hop cadence
                this.hopCycle += delta * 5.4;
                const jumpPhase = Math.sin(this.hopCycle);
                const jumpLift = Math.max(0, jumpPhase);
                // Translate primarily while airborne
                const leapImpulse = jumpLift > 0 ? (jumpLift * 1.5) : 0.15;
                const speed = Math.min(85, dist * 2.0 + 20);
                this.pagePos.x += (dx / dist) * speed * delta * leapImpulse;
                this.pagePos.y += (dy / dist) * speed * delta * leapImpulse;

                // Smooth 3D heading orientation facing travel direction
                const targetHeading = Math.atan2(dx, dy);
                let diff = targetHeading - this.bunnyRoot.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                this.bunnyRoot.rotation.y += diff * Math.min(1.0, delta * 9.0);
            }
            this.clampToBounds();
        } else {
            this.isHopping = false;
        }

        // Random Joyful Backflip (Binky) Trigger (Respects reduced motion preference)
        if (
            !this.prefersReducedMotion &&
            this.state === 'idle' &&
            !this.isDragging &&
            !this.isHopping &&
            !this.isBackflipping &&
            !this.stateManager.state.isDead &&
            !this.stateManager.state.isSleeping &&
            this.isUserOnScreen &&
            !this.isUserInteracting &&
            (now - this.lastBackflipTime > this.nextBackflipInterval)
        ) {
            this.isBackflipping = true;
            this.backflipStartTime = now;
            this.lastBackflipTime = now;
            this.nextBackflipInterval = 28000 + Math.random() * 20000; // Next in 28-48s
        }

        if (this.isDragging) {
            // Held up in air by the scruff of the neck!
            this.state = 'held';

            // Gradual holding fatigue (~14 seconds)
            this.oxygenLevel = Math.max(0, this.oxygenLevel - delta * 7.2);
            this.heartRate = Math.min(205, 140 + (100 - this.oxygenLevel) * 0.75);

            if (now - this.lastBeepTime > (60000 / this.heartRate)) {
                this.lastBeepTime = now;
                this.playPulseBeep();
            }

            this.updateCornerCapsule(this.oxygenLevel, this.heartRate, true);

            if (this.oxygenLevel <= 0) {
                this.faintFromChoking();
            } else if (this.gltfScene) {
                // Sensitive parts holding posture
                if (this.heldPart === 'ears') {
                    // Held by the ears: Head points upward, ears held straight up
                    this.gltfScene.rotation.x = THREE.MathUtils.lerp(this.gltfScene.rotation.x, -0.85, delta * 8.0);
                    if (this.gltfNodes) {
                        if (this.gltfNodes.head) {
                            this.gltfNodes.head.rotation.x = 0.25;
                            this.gltfNodes.head.rotation.y = Math.sin(time * 8) * 0.10;
                        }
                        if (this.gltfNodes.earL) this.gltfNodes.earL.rotation.set(0.12, 0, 0.04);
                        if (this.gltfNodes.earR) this.gltfNodes.earR.rotation.set(0.12, 0, -0.04);
                    }
                } else if (this.heldPart === 'scruff') {
                    // Foldable from the neck: Body hangs straight down vertically under the scruff
                    this.gltfScene.rotation.x = THREE.MathUtils.lerp(this.gltfScene.rotation.x, -1.35, delta * 8.0);
                    if (this.gltfNodes) {
                        if (this.gltfNodes.head) {
                            this.gltfNodes.head.rotation.x = -0.42;
                            this.gltfNodes.head.rotation.y = Math.sin(time * 12) * 0.15;
                        }
                        if (this.gltfNodes.earL) this.gltfNodes.earL.rotation.z = -0.3 + Math.sin(time * 18) * 0.15;
                        if (this.gltfNodes.earR) this.gltfNodes.earR.rotation.z = 0.3 - Math.sin(time * 18) * 0.15;
                    }
                } else {
                    // Held by body / head: slightly cradled back
                    this.gltfScene.rotation.x = THREE.MathUtils.lerp(this.gltfScene.rotation.x, -1.10, delta * 8.0);
                    if (this.gltfNodes) {
                        if (this.gltfNodes.head) {
                            this.gltfNodes.head.rotation.x = -0.25;
                            this.gltfNodes.head.rotation.y = Math.sin(time * 10) * 0.12;
                        }
                        if (this.gltfNodes.earL) this.gltfNodes.earL.rotation.z = -0.20 + Math.sin(time * 14) * 0.12;
                        if (this.gltfNodes.earR) this.gltfNodes.earR.rotation.z = 0.20 - Math.sin(time * 14) * 0.12;
                    }
                }

                // Damped harmonic pendulum spring inertia
                const springK = 38.0;
                const damping = 6.2;
                const force = -Math.max(-15, Math.min(15, this.dragVelocityX || 0)) * 0.08;
                this.dangleAccel = -springK * this.dangleAngle - damping * this.dangleVel + force;
                this.dangleVel += this.dangleAccel * delta;
                this.dangleAngle += this.dangleVel * delta;
                this.dangleAngle = Math.max(-0.65, Math.min(0.65, this.dangleAngle));
                this.bunnyRoot.rotation.z = this.dangleAngle;
                this.dragVelocityX = (this.dragVelocityX || 0) * 0.88;

                // Little paddling legs, hands, and feet while suspended
                const scramble = Math.sin(time * 16);
                if (this.gltfNodes) {
                    if (this.gltfNodes.legFrontR) this.gltfNodes.legFrontR.rotation.x = scramble * 0.42;
                    if (this.gltfNodes.legFrontL) this.gltfNodes.legFrontL.rotation.x = -scramble * 0.42;
                    if (this.gltfNodes.footFrontR) this.gltfNodes.footFrontR.rotation.x = -scramble * 0.35;
                    if (this.gltfNodes.footFrontL) this.gltfNodes.footFrontL.rotation.x = scramble * 0.35;
                    if (this.gltfNodes.legHindR) this.gltfNodes.legHindR.rotation.x = -scramble * 0.38;
                    if (this.gltfNodes.legHindL) this.gltfNodes.legHindL.rotation.x = scramble * 0.38;
                    if (this.gltfNodes.footHindR) this.gltfNodes.footHindR.rotation.x = scramble * 0.32;
                    if (this.gltfNodes.footHindL) this.gltfNodes.footHindL.rotation.x = -scramble * 0.32;
                }
            }
        } else {
            // Natural damped spring settling for dangleAngle
            if (Math.abs(this.dangleAngle) > 0.001 || Math.abs(this.dangleVel) > 0.001) {
                const springK = 32.0;
                const damping = 6.8;
                this.dangleAccel = -springK * this.dangleAngle - damping * this.dangleVel;
                this.dangleVel += this.dangleAccel * delta;
                this.dangleAngle += this.dangleVel * delta;
                this.bunnyRoot.rotation.z = this.dangleAngle;
            } else {
                this.dangleAngle = 0;
                this.dangleVel = 0;
            }
        }

        if (this.stateManager.state.isSleeping && !this.isDragging) {
            // ==============================================================
            // PEACEFUL SNOOZE / SLEEPING STATE
            // Calmly curled up on the desk surface, breathing deeply & quietly
            // ==============================================================
            this.state = 'sleeping';
            if (this.mixer) {
                this.mixer.stopAllAction();
            }
            this.currentAction = null;

            const sleepBreath = Math.sin(time * 1.2) * 0.008;
            if (this.gltfScene) {
                const baseS = this.gltfBaseScale || 1.0;
                this.gltfScene.position.y = THREE.MathUtils.lerp(this.gltfScene.position.y, -0.32 + sleepBreath * 0.2, delta * 4.0);
                this.gltfScene.rotation.x = THREE.MathUtils.lerp(this.gltfScene.rotation.x, 0.16, delta * 4.0);
                this.gltfScene.rotation.z = 0;
                this.gltfScene.scale.set(baseS * (1.0 + sleepBreath * 0.3), baseS * (1.0 + sleepBreath), baseS * (1.0 + sleepBreath * 0.3));
            }

            if (this.gltfNodes) {
                if (this.gltfNodes.head) {
                    this.gltfNodes.head.rotation.set(-0.16, 0, 0);
                }
                if (this.gltfNodes.earL) {
                    this.gltfNodes.earL.rotation.set(0.08, 0, -0.42);
                }
                if (this.gltfNodes.earR) {
                    this.gltfNodes.earR.rotation.set(0.08, 0, 0.42);
                }
                if (this.gltfNodes.cheekL) this.gltfNodes.cheekL.scale.y = 0.05;
                if (this.gltfNodes.cheekR) this.gltfNodes.cheekR.scale.y = 0.05;

                if (this.gltfNodes.legFrontR) this.gltfNodes.legFrontR.rotation.set(0, 0, 0);
                if (this.gltfNodes.legFrontL) this.gltfNodes.legFrontL.rotation.set(0, 0, 0);
                if (this.gltfNodes.legHindR) this.gltfNodes.legHindR.rotation.set(0, 0, 0);
                if (this.gltfNodes.legHindL) this.gltfNodes.legHindL.rotation.set(0, 0, 0);
            }

            this.updateCornerCapsule(this.oxygenLevel, 82, false);
        } else if (this.state === 'fainted' || this.stateManager.state.isDead) {
            // ==============================================================
            // REALISTIC DEAD STATE: ZERO MOVEMENT IN HANDS OR LEGS
            // Lays completely limp and flat on its side on the surface
            // ==============================================================
            if (this.mixer) {
                this.mixer.stopAllAction();
            }
            this.currentAction = null;

            if (this.gltfScene) {
                this.gltfScene.rotation.z = THREE.MathUtils.lerp(this.gltfScene.rotation.z, Math.PI / 2, delta * 8.0);
                this.gltfScene.rotation.x = THREE.MathUtils.lerp(this.gltfScene.rotation.x, 0.05, delta * 8.0);
                this.gltfScene.position.y = -0.36;
            }

            if (this.gltfNodes) {
                // Hands and legs stop moving completely - totally limp
                if (this.gltfNodes.legFrontR) this.gltfNodes.legFrontR.rotation.set(0, 0, 0);
                if (this.gltfNodes.legFrontL) this.gltfNodes.legFrontL.rotation.set(0, 0, 0);
                if (this.gltfNodes.legHindR) {
                    this.gltfNodes.legHindR.rotation.set(0, 0, 0);
                    this.gltfNodes.legHindR.position.set(0.171875, 0.28125, 0);
                }
                if (this.gltfNodes.legHindL) {
                    this.gltfNodes.legHindL.rotation.set(0, 0, 0);
                    this.gltfNodes.legHindL.position.set(-0.171875, 0.28125, 0);
                }
                if (this.gltfNodes.footHindR) this.gltfNodes.footHindR.rotation.set(0, 0, 0);
                if (this.gltfNodes.footHindL) this.gltfNodes.footHindL.rotation.set(0, 0, 0);

                // Closed lifeless eyes
                if (this.gltfNodes.cheekL) this.gltfNodes.cheekL.scale.y = 0.05;
                if (this.gltfNodes.cheekR) this.gltfNodes.cheekR.scale.y = 0.05;

                // Limp ears
                if (this.gltfNodes.earL) this.gltfNodes.earL.rotation.z = -0.7;
                if (this.gltfNodes.earR) this.gltfNodes.earR.rotation.z = -0.5;

                // Muzzle still
                if (this.gltfNodes.muzzle) {
                    this.gltfNodes.muzzle.position.set(0, 0, -0.231);
                    this.gltfNodes.muzzle.scale.set(1.0, 1.0, 1.0);
                }
            }

            this.updateCornerCapsule(0, 0, false);
        } else if (this.state === 'pant') {
            // Recovering breath after release
            this.oxygenLevel = Math.min(100, this.oxygenLevel + delta * 35.0);
            this.heartRate = Math.max(140, this.heartRate - delta * 25.0);
            this.updateCornerCapsule(this.oxygenLevel, this.heartRate, false);

            if (now - this.lastBeepTime > (60000 / this.heartRate)) {
                this.lastBeepTime = now;
                this.playPulseBeep();
            }

            // Rapid breathing catch
            const pantBreath = Math.sin(time * 12) * 0.02;
            if (this.gltfScene) {
                const baseS = this.gltfBaseScale || 1.0;
                this.gltfScene.scale.set(baseS * (1.0 + pantBreath), baseS * (1.0 + pantBreath), baseS);
                this.gltfScene.position.y = -0.28 + Math.abs(pantBreath) * 0.3;
            }

            if (this.oxygenLevel >= 99) {
                this.state = 'idle';
            }
        } else if (this.isHopping) {
            // ==============================================================
            // SLOW & REALISTIC JUMPING / HOPPING STATE:
            // Rabbit bounds forward with gentle, slow, articulated rabbit jumps!
            // ==============================================================
            this.state = 'hopping';

            const jumpPhase = Math.sin(this.hopCycle);
            const jumpLift = Math.max(0, jumpPhase) * 0.22;
            const squash = Math.max(0, -jumpPhase) * 0.08;

            if (this.gltfScene) {
                this.gltfScene.position.y = -0.28 + jumpLift - squash * 0.5;
                // Forward rabbit pitch during bounding stride
                this.gltfScene.rotation.x = 0.38 - jumpPhase * 0.16;
                this.gltfScene.scale.set(
                    this.gltfBaseScale * (1 + squash * 0.25),
                    this.gltfBaseScale * (1 - squash * 0.35),
                    this.gltfBaseScale * (1 + squash * 0.25)
                );
            }

            if (this.gltfNodes) {
                // Spine / Torso arch
                if (this.gltfNodes.torso) this.gltfNodes.torso.rotation.x = jumpPhase * 0.14;

                // Alert head bobbing with flight
                if (this.gltfNodes.head) {
                    this.gltfNodes.head.rotation.x = -jumpPhase * 0.12;
                    this.gltfNodes.head.rotation.y = 0;
                    this.gltfNodes.head.rotation.z = 0;
                }

                // Ears flap back with jump inertia and cushion forward on landing
                if (this.gltfNodes.earL) this.gltfNodes.earL.rotation.x = 0.20 + jumpPhase * 0.22;
                if (this.gltfNodes.earR) this.gltfNodes.earR.rotation.x = 0.20 + jumpPhase * 0.22;

                // Tail bobs with each hop
                if (this.gltfNodes.tail) this.gltfNodes.tail.rotation.x = jumpPhase * 0.28;

                // Front paws reach forward on descent and cushion on landing
                if (this.gltfNodes.legFrontR) this.gltfNodes.legFrontR.rotation.x = -jumpPhase * 0.56;
                if (this.gltfNodes.legFrontL) this.gltfNodes.legFrontL.rotation.x = -jumpPhase * 0.56;
                if (this.gltfNodes.footFrontR) this.gltfNodes.footFrontR.rotation.x = jumpPhase * 0.40;
                if (this.gltfNodes.footFrontL) this.gltfNodes.footFrontL.rotation.x = jumpPhase * 0.40;

                // Hind legs push off on launch and tuck under belly mid-flight
                if (this.gltfNodes.legHindR) {
                    this.gltfNodes.legHindR.rotation.x = jumpPhase * 0.50;
                    this.gltfNodes.legHindR.position.y = 0.281 - Math.max(0, -jumpPhase) * 0.04;
                }
                if (this.gltfNodes.legHindL) {
                    this.gltfNodes.legHindL.rotation.x = jumpPhase * 0.50;
                    this.gltfNodes.legHindL.position.y = 0.281 - Math.max(0, -jumpPhase) * 0.04;
                }
                if (this.gltfNodes.footHindR) this.gltfNodes.footHindR.rotation.x = -jumpPhase * 0.44;
                if (this.gltfNodes.footHindL) this.gltfNodes.footHindL.rotation.x = -jumpPhase * 0.44;
            }
        } else {
            // ==============================================================
            // PURE REALISTIC IDLE COMPANION
            // Stays peacefully settled on the desk.
            // Paws remain planted; no continuous translation across screen.
            // Rich, lifelike facial expressions, screen awareness & random backflips
            // ==============================================================
            this.state = 'idle';
            if (this.mixer && !this.isBackflipping) {
                this.mixer.stopAllAction(); // Freeze walking legs/hands ONLY when truly idle
                this.currentAction = null;
            }

            if (this.isBackflipping) {
                // Execute Joyful Backflip (Binky)
                const flipElapsed = now - this.backflipStartTime;
                const progress = Math.min(1.0, flipElapsed / this.backflipDuration);

                if (progress < 1.0) {
                    if (progress < 0.15) {
                        // Windup crouch
                        const crouch = progress / 0.15;
                        if (this.gltfScene) {
                            this.gltfScene.position.y = -0.28 - crouch * 0.05;
                            this.gltfScene.scale.set(this.gltfBaseScale * 1.05, this.gltfBaseScale * 0.94, this.gltfBaseScale * 1.05);
                        }
                        if (this.gltfNodes && this.gltfNodes.head) {
                            this.gltfNodes.head.rotation.x = -0.15;
                        }
                    } else if (progress < 0.85) {
                        // Mid-air 360 degree backflip
                        const flipPhase = (progress - 0.15) / 0.70;
                        const jumpArc = Math.sin(flipPhase * Math.PI) * 0.65;
                        const flipAngle = -Math.PI * 2 * flipPhase;

                        if (this.gltfScene) {
                            this.gltfScene.position.y = -0.28 + jumpArc;
                            this.gltfScene.rotation.x = 0.38 + flipAngle;
                            this.gltfScene.scale.set(this.gltfBaseScale, this.gltfBaseScale, this.gltfBaseScale);
                        }

                        if (this.gltfNodes) {
                            if (this.gltfNodes.legFrontR) this.gltfNodes.legFrontR.rotation.x = 0.45;
                            if (this.gltfNodes.legFrontL) this.gltfNodes.legFrontL.rotation.x = 0.45;
                            if (this.gltfNodes.footFrontR) this.gltfNodes.footFrontR.rotation.x = 0.55;
                            if (this.gltfNodes.footFrontL) this.gltfNodes.footFrontL.rotation.x = 0.55;
                            if (this.gltfNodes.legHindR) this.gltfNodes.legHindR.rotation.x = -0.45;
                            if (this.gltfNodes.legHindL) this.gltfNodes.legHindL.rotation.x = -0.45;
                            if (this.gltfNodes.footHindR) this.gltfNodes.footHindR.rotation.x = -0.40;
                            if (this.gltfNodes.footHindL) this.gltfNodes.footHindL.rotation.x = -0.40;
                            if (this.gltfNodes.earL) this.gltfNodes.earL.rotation.z = -0.35 + Math.sin(flipPhase * 16) * 0.1;
                            if (this.gltfNodes.earR) this.gltfNodes.earR.rotation.z = 0.35 - Math.sin(flipPhase * 16) * 0.1;
                        }
                    } else {
                        // Landing squash & stretch recovery
                        const landPhase = (progress - 0.85) / 0.15;
                        const squash = Math.sin(landPhase * Math.PI) * 0.12;

                        if (this.gltfScene) {
                            this.gltfScene.position.y = -0.28 - squash * 0.04;
                            this.gltfScene.rotation.x = 0.38;
                            this.gltfScene.scale.set(
                                this.gltfBaseScale * (1.0 + squash * 0.4),
                                this.gltfBaseScale * (1.0 - squash),
                                this.gltfBaseScale * (1.0 + squash * 0.4)
                            );
                        }
                        if (this.gltfNodes) {
                            if (this.gltfNodes.legFrontR) this.gltfNodes.legFrontR.rotation.set(0, 0, 0);
                            if (this.gltfNodes.legFrontL) this.gltfNodes.legFrontL.rotation.set(0, 0, 0);
                            if (this.gltfNodes.footFrontR) this.gltfNodes.footFrontR.rotation.set(0, 0, 0);
                            if (this.gltfNodes.footFrontL) this.gltfNodes.footFrontL.rotation.set(0, 0, 0);
                            if (this.gltfNodes.legHindR) this.gltfNodes.legHindR.rotation.set(0, 0, 0);
                            if (this.gltfNodes.legHindL) this.gltfNodes.legHindL.rotation.set(0, 0, 0);
                            if (this.gltfNodes.footHindR) this.gltfNodes.footHindR.rotation.set(0, 0, 0);
                            if (this.gltfNodes.footHindL) this.gltfNodes.footHindL.rotation.set(0, 0, 0);
                        }
                    }
                } else {
                    this.isBackflipping = false;
                    if (this.gltfScene) {
                        this.gltfScene.position.y = -0.28;
                        this.gltfScene.rotation.x = 0.38;
                        this.gltfScene.scale.set(this.gltfBaseScale, this.gltfBaseScale, this.gltfBaseScale);
                    }
                    if (this.gltfNodes) {
                        if (this.gltfNodes.legFrontR) {
                            this.gltfNodes.legFrontR.rotation.set(0, 0, 0);
                            this.gltfNodes.legFrontR.position.set(0.09375, 0.25, -0.3);
                        }
                        if (this.gltfNodes.legFrontL) {
                            this.gltfNodes.legFrontL.rotation.set(0, 0, 0);
                            this.gltfNodes.legFrontL.position.set(-0.09375, 0.25, -0.3);
                        }
                        if (this.gltfNodes.footFrontR) this.gltfNodes.footFrontR.rotation.set(0, 0, 0);
                        if (this.gltfNodes.footFrontL) this.gltfNodes.footFrontL.rotation.set(0, 0, 0);
                        if (this.gltfNodes.legHindR) {
                            this.gltfNodes.legHindR.rotation.set(0, 0, 0);
                            this.gltfNodes.legHindR.position.set(0.171875, 0.28125, 0);
                        }
                        if (this.gltfNodes.legHindL) {
                            this.gltfNodes.legHindL.rotation.set(0, 0, 0);
                            this.gltfNodes.legHindL.position.set(-0.171875, 0.28125, 0);
                        }
                        if (this.gltfNodes.footHindR) this.gltfNodes.footHindR.rotation.set(0, 0, 0);
                        if (this.gltfNodes.footHindL) this.gltfNodes.footHindL.rotation.set(0, 0, 0);
                    }
                }
            } else {
                // Not backflipping: Pure Lifelike Idle
                if (!this.isHopping) {
                    // Smoothly turn back to face front toward the user
                    let diff = 0 - this.bunnyRoot.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    this.bunnyRoot.rotation.y += diff * Math.min(1.0, delta * 6.0);
                }
                this.bunnyRoot.rotation.z = THREE.MathUtils.lerp(this.bunnyRoot.rotation.z, 0, delta * 6.0);
                this.bunnyRoot.rotation.x = THREE.MathUtils.lerp(this.bunnyRoot.rotation.x, 0, delta * 6.0);

                if (!this.isHopping && this.gltfScene) {
                    this.gltfScene.rotation.x = THREE.MathUtils.lerp(this.gltfScene.rotation.x, 0.38, delta * 6.0);
                    this.gltfScene.rotation.z = 0;
                }

                // Dynamic Lifelike Idle Limbs, Hands & Feet:
                if (this.gltfNodes && !this.isHopping) {
                    // 1. Organic breathing wave across all 4 limbs and feet
                    const limbBreath = Math.sin(time * 2.6);
                    const baseLegX = -limbBreath * 0.04;
                    const baseFootX = limbBreath * 0.035;

                    // 2. Paw weight-shifting / stepping adjustments every ~5.5s
                    const pawCycle = time % 5.5;
                    let shiftR = 0;
                    let shiftL = 0;
                    if (this.isUserOnScreen) {
                        if (pawCycle > 1.8 && pawCycle < 2.6) {
                            const p = (pawCycle - 1.8) / 0.8;
                            shiftR = Math.sin(p * Math.PI) * 0.16;
                        } else if (pawCycle > 4.5 && pawCycle < 5.3) {
                            const p = (pawCycle - 4.5) / 0.8;
                            shiftL = Math.sin(p * Math.PI) * 0.16;
                        }
                    }

                    // 3. Cute Face-Grooming / Washing Cheeks with Hands every ~24s
                    const groomCycle = time % 24.0;
                    const isGrooming = this.isUserOnScreen && !this.isUserInteracting && (groomCycle > 19.2 && groomCycle < 21.6);

                    if (isGrooming) {
                        // Iconic rabbit washing its face with both hands / front paws!
                        const groomPhase = (groomCycle - 19.2) / 2.4;
                        const groomRub = Math.sin(time * 22.0) * 0.15;
                        const groomEntry = Math.sin(groomPhase * Math.PI); // Smooth in & out envelope

                        if (this.gltfNodes.legFrontR) {
                            this.gltfNodes.legFrontR.rotation.x = -1.18 * groomEntry + groomRub;
                            this.gltfNodes.legFrontR.rotation.z = -0.25 * groomEntry;
                            this.gltfNodes.legFrontR.position.set(0.09375, 0.25 + 0.04 * groomEntry, -0.3);
                        }
                        if (this.gltfNodes.legFrontL) {
                            this.gltfNodes.legFrontL.rotation.x = -1.18 * groomEntry - groomRub;
                            this.gltfNodes.legFrontL.rotation.z = 0.25 * groomEntry;
                            this.gltfNodes.legFrontL.position.set(-0.09375, 0.25 + 0.04 * groomEntry, -0.3);
                        }
                        if (this.gltfNodes.footFrontR) {
                            this.gltfNodes.footFrontR.rotation.x = 0.75 * groomEntry + groomRub;
                        }
                        if (this.gltfNodes.footFrontL) {
                            this.gltfNodes.footFrontL.rotation.x = 0.75 * groomEntry - groomRub;
                        }
                        if (this.gltfNodes.head) {
                            this.gltfNodes.head.rotation.x = THREE.MathUtils.lerp(this.gltfNodes.head.rotation.x, -0.12, delta * 6.0);
                        }
                    } else {
                        // Normal living idle: breathing + periodic paw adjustments
                        if (this.gltfNodes.legFrontR) {
                            this.gltfNodes.legFrontR.rotation.x = baseLegX - shiftR;
                            this.gltfNodes.legFrontR.rotation.z = 0;
                            this.gltfNodes.legFrontR.position.set(0.09375, 0.25 + shiftR * 0.08, -0.3);
                        }
                        if (this.gltfNodes.legFrontL) {
                            this.gltfNodes.legFrontL.rotation.x = baseLegX - shiftL;
                            this.gltfNodes.legFrontL.rotation.z = 0;
                            this.gltfNodes.legFrontL.position.set(-0.09375, 0.25 + shiftL * 0.08, -0.3);
                        }
                        if (this.gltfNodes.footFrontR) {
                            this.gltfNodes.footFrontR.rotation.x = baseFootX + shiftR * 0.8;
                        }
                        if (this.gltfNodes.footFrontL) {
                            this.gltfNodes.footFrontL.rotation.x = baseFootX + shiftL * 0.8;
                        }
                    }

                    // Hind legs & rear feet natural breathing cushion & settle
                    if (this.gltfNodes.legHindR) {
                        this.gltfNodes.legHindR.rotation.x = limbBreath * 0.025;
                        this.gltfNodes.legHindR.position.set(0.171875, 0.28125 - limbBreath * 0.005, 0);
                    }
                    if (this.gltfNodes.legHindL) {
                        this.gltfNodes.legHindL.rotation.x = limbBreath * 0.025;
                        this.gltfNodes.legHindL.position.set(-0.171875, 0.28125 - limbBreath * 0.005, 0);
                    }
                    if (this.gltfNodes.footHindR) {
                        this.gltfNodes.footHindR.rotation.x = -limbBreath * 0.025;
                    }
                    if (this.gltfNodes.footHindL) {
                        this.gltfNodes.footHindL.rotation.x = -limbBreath * 0.025;
                    }
                }

                if (this.isUserOnScreen) {
                    // ==========================================================
                    // 1. USER IS ON SCREEN: LIVELY AWARENESS
                    // ==========================================================
                    const breath = Math.sin(time * 2.6) * 0.012;
                    if (this.gltfScene && !this.isHopping) {
                        const baseS = this.gltfBaseScale || 1.0;
                        this.gltfScene.scale.set(baseS * (1.0 + breath * 0.3), baseS * (1.0 + breath), baseS * (1.0 + breath * 0.3));
                        this.gltfScene.position.y = -0.28 + breath * 0.005;
                    }

                    if (this.gltfNodes) {
                        // Inquisitive head glance tracking pointer within natural biomechanical limits
                        const screenX = this.pagePos.x;
                        const screenY = this.pagePos.y - window.scrollY;
                        const mouseDx = this.lastKnownPointer.x - screenX;
                        const mouseDy = this.lastKnownPointer.y - screenY;

                        const targetHeadYaw = Math.max(-0.28, Math.min(0.28, mouseDx * 0.0006));
                        const targetHeadPitch = Math.max(-0.12, Math.min(0.16, mouseDy * 0.0004));
                        const targetHeadTilt = Math.sin(time * 0.9) * 0.035 + Math.max(-0.06, Math.min(0.06, mouseDx * 0.0002));

                        if (this.gltfNodes.head) {
                            this.gltfNodes.head.rotation.y = THREE.MathUtils.lerp(this.gltfNodes.head.rotation.y, targetHeadYaw, delta * 4.5);
                            this.gltfNodes.head.rotation.x = THREE.MathUtils.lerp(this.gltfNodes.head.rotation.x, 0.06 + targetHeadPitch, delta * 4.5);
                            this.gltfNodes.head.rotation.z = THREE.MathUtils.lerp(this.gltfNodes.head.rotation.z, targetHeadTilt, delta * 3.5);
                        }

                        // Nose & Muzzle Sniffing bursts
                        const sniffPeriod = time % 3.2;
                        let sniffIntensity = 0;
                        if (sniffPeriod < 1.6) {
                            sniffIntensity = Math.sin(sniffPeriod * Math.PI * 8);
                        }

                        if (this.gltfNodes.muzzle) {
                            this.gltfNodes.muzzle.position.z = -0.231 + sniffIntensity * 0.008;
                            this.gltfNodes.muzzle.scale.set(1.0 + sniffIntensity * 0.035, 1.0 + sniffIntensity * 0.035, 1.0);
                        }
                        if (this.gltfWhiskers) {
                            this.gltfWhiskers.rotation.z = sniffIntensity * 0.06;
                        }

                        // Independent ear movements
                        const earLTwitch = (Math.sin(time * 3.8) > 0.93) ? 0.16 : 0;
                        const earLYaw = -targetHeadYaw * 0.45 + Math.sin(time * 1.5) * 0.06;
                        if (this.gltfNodes.earL) {
                            this.gltfNodes.earL.rotation.z = -0.06 + Math.sin(time * 1.6) * 0.04 + earLTwitch;
                            this.gltfNodes.earL.rotation.y = earLYaw;
                            this.gltfNodes.earL.rotation.x = -0.10 + Math.sin(time * 1.1) * 0.03;
                        }

                        const earRTwitch = (Math.sin(time * 5.1 + 2.0) > 0.93) ? -0.16 : 0;
                        const earRYaw = -targetHeadYaw * 0.45 - Math.cos(time * 1.7) * 0.06;
                        if (this.gltfNodes.earR) {
                            this.gltfNodes.earR.rotation.z = 0.06 - Math.sin(time * 1.8 + 1) * 0.04 + earRTwitch;
                            this.gltfNodes.earR.rotation.y = earRYaw;
                            this.gltfNodes.earR.rotation.x = -0.10 + Math.sin(time * 1.3) * 0.03;
                        }

                    }

                    // Tactile Touch & Petting Feedback on Sensitive Parts
                    const pointerDist = Math.hypot(this.lastKnownPointer.x - this.pagePos.x, this.lastKnownPointer.y - this.pagePos.y);
                    const isTouchingRabbit = this.isTouching || !!this.hoveredPart || (pointerDist < 60);

                    if (isTouchingRabbit && this.gltfNodes) {
                        // ======================================================
                        // SENSITIVE PARTS TOUCHING / PETTING REACTIONS:
                        // Rabbit loves being touched! Does NOT flee.
                        // Sensitive parts (ears, head, scruff, body, tail) react with delight.
                        // ======================================================
                        if (this.hoveredPart === 'ears') {
                            // Ears touched: Playful flutter & cocked head
                            if (this.gltfNodes.earL) this.gltfNodes.earL.rotation.z = -0.06 + Math.sin(time * 18) * 0.16;
                            if (this.gltfNodes.earR) this.gltfNodes.earR.rotation.z = 0.06 - Math.sin(time * 18) * 0.16;
                            if (this.gltfNodes.head) this.gltfNodes.head.rotation.z = THREE.MathUtils.lerp(this.gltfNodes.head.rotation.z, 0.12, delta * 6);
                            if (this.gltfNodes.cheekL) this.gltfNodes.cheekL.scale.y = 0.4;
                            if (this.gltfNodes.cheekR) this.gltfNodes.cheekR.scale.y = 0.4;
                        } else if (this.hoveredPart === 'head') {
                            // Head / Cheeks touched: Happy crescent squints & affectionate upward nuzzle
                            if (this.gltfNodes.cheekL) this.gltfNodes.cheekL.scale.y = 0.12;
                            if (this.gltfNodes.cheekR) this.gltfNodes.cheekR.scale.y = 0.12;
                            if (this.gltfNodes.head) this.gltfNodes.head.rotation.x = THREE.MathUtils.lerp(this.gltfNodes.head.rotation.x, 0.22, delta * 6);
                        } else if (this.hoveredPart === 'tail') {
                            // Tail touched: Ticklish quick tail wiggle!
                            if (this.gltfNodes.tail) this.gltfNodes.tail.rotation.z = Math.sin(time * 24) * 0.28;
                        } else {
                            // Scruff / Body touched: Relaxed arching & contented purr breathing
                            if (this.gltfNodes.torso) this.gltfNodes.torso.rotation.x = THREE.MathUtils.lerp(this.gltfNodes.torso.rotation.x, -0.06, delta * 5);
                            if (this.gltfNodes.cheekL) this.gltfNodes.cheekL.scale.y = 0.35;
                            if (this.gltfNodes.cheekR) this.gltfNodes.cheekR.scale.y = 0.35;
                        }

                        // Floating affection hearts while being touched
                        if (now - this.lastPetTime > 1600) {
                            this.lastPetTime = now;
                            this.spawnFloatingHeart('❤️');
                        }
                    } else if (this.gltfNodes) {
                        // Eye Blinking (quick 140ms blink every ~4.2s)
                        const blinkPeriod = time % 4.2;
                        const isBlinking = blinkPeriod > 4.06;
                        const eyeScaleY = isBlinking ? 0.10 : 1.0;
                        if (this.gltfNodes.cheekL) this.gltfNodes.cheekL.scale.y = eyeScaleY;
                        if (this.gltfNodes.cheekR) this.gltfNodes.cheekR.scale.y = eyeScaleY;

                        // Subtle tail settle
                        if (this.gltfNodes.tail) {
                            this.gltfNodes.tail.rotation.z = Math.sin(time * 0.8) * 0.05;
                        }
                    }
                } else {
                    // ==========================================================
                    // 2. USER LEFT THE SCREEN: CALM RESTING / DOZING STATE
                    // Does not get confused searching for cursor. Enters peaceful rest.
                    // ==========================================================
                    const slowBreath = Math.sin(time * 1.5) * 0.010;
                    if (this.gltfScene && !this.isHopping) {
                        const baseS = this.gltfBaseScale || 1.0;
                        this.gltfScene.scale.set(baseS * (1.0 + slowBreath * 0.2), baseS * (1.0 + slowBreath), baseS * (1.0 + slowBreath * 0.2));
                        this.gltfScene.position.y = -0.28 + slowBreath * 0.004;
                    }

                    if (this.gltfNodes) {
                        // Head stays peacefully centered
                        if (this.gltfNodes.head) {
                            this.gltfNodes.head.rotation.y = THREE.MathUtils.lerp(this.gltfNodes.head.rotation.y, 0, delta * 3.0);
                            this.gltfNodes.head.rotation.x = THREE.MathUtils.lerp(this.gltfNodes.head.rotation.x, 0.03, delta * 3.0);
                            this.gltfNodes.head.rotation.z = THREE.MathUtils.lerp(this.gltfNodes.head.rotation.z, 0, delta * 3.0);
                        }

                        // Ears relax backward comfortably
                        if (this.gltfNodes.earL) {
                            this.gltfNodes.earL.rotation.z = THREE.MathUtils.lerp(this.gltfNodes.earL.rotation.z, -0.20, delta * 3.0);
                            this.gltfNodes.earL.rotation.x = THREE.MathUtils.lerp(this.gltfNodes.earL.rotation.x, 0.08, delta * 3.0);
                            this.gltfNodes.earL.rotation.y = THREE.MathUtils.lerp(this.gltfNodes.earL.rotation.y, 0, delta * 3.0);
                        }
                        if (this.gltfNodes.earR) {
                            this.gltfNodes.earR.rotation.z = THREE.MathUtils.lerp(this.gltfNodes.earR.rotation.z, 0.20, delta * 3.0);
                            this.gltfNodes.earR.rotation.x = THREE.MathUtils.lerp(this.gltfNodes.earR.rotation.x, 0.08, delta * 3.0);
                            this.gltfNodes.earR.rotation.y = THREE.MathUtils.lerp(this.gltfNodes.earR.rotation.y, 0, delta * 3.0);
                        }

                        // Half-lidded sleepy / resting eyes
                        if (this.gltfNodes.cheekL) this.gltfNodes.cheekL.scale.y = 0.32;
                        if (this.gltfNodes.cheekR) this.gltfNodes.cheekR.scale.y = 0.32;

                        // Nose relaxed
                        if (this.gltfNodes.muzzle) {
                            this.gltfNodes.muzzle.position.set(0, 0, -0.231);
                            this.gltfNodes.muzzle.scale.set(1.0, 1.0, 1.0);
                        }
                    }
                }
            }
        }

        // Dynamic Ground Contact Shadow
        if (this.shadowMesh) {
            const isFainted = (this.state === 'fainted' || this.stateManager.state.isDead);
            const modelY = this.gltfScene ? (this.gltfScene.position.y - (-0.28)) : 0;
            const dragLift = this.isDragging ? 0.42 : 0;
            const totalLift = Math.max(0, modelY + dragLift);

            const baseShadowScale = 1.0 + (this.landingSquash || 0) * 0.4;
            const shadowScale = Math.max(0.35, (1.0 - totalLift * 0.45) * baseShadowScale);
            this.shadowMesh.scale.set(shadowScale, shadowScale, 1.0);
            this.shadowMesh.material.opacity = Math.max(0.08, (isFainted ? 0.22 : 0.42) - totalLift * 0.32);
            this.shadowMesh.position.y = -0.34 - (this.isDragging ? 0.42 : 0);
        }

        // Apply physical landing squash-and-stretch on model
        if (this.gltfScene && this.landingSquash !== 0 && this.state !== 'fainted' && this.state !== 'sleeping') {
            const baseS = this.gltfBaseScale || 1.0;
            this.gltfScene.scale.set(
                baseS * (1.0 + this.landingSquash * 0.45),
                baseS * (1.0 - this.landingSquash),
                baseS * (1.0 + this.landingSquash * 0.45)
            );
        }

        // World coordinates
        const screenX = this.pagePos.x;
        const screenY = this.pagePos.y - window.scrollY;

        const worldPos = this.screenToWorld(screenX, screenY);
        this.bunnyRoot.position.x = worldPos.x;
        this.bunnyRoot.position.z = worldPos.z;

        const lift = this.isDragging ? 0.42 : ((this.state === 'fainted' || this.stateManager.state.isDead) ? -0.06 : 0);
        this.bunnyRoot.position.y = worldPos.y + lift;

        // Live EKG wave rendering ONLY when Corner Capsule Drawer is expanded
        if (this.ekgCanvas && this.cornerCapsuleEl && this.cornerCapsuleEl.classList.contains('expanded')) {
            this.drawEKGWave(delta);
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// Backward-compatible alias
export const ThreeRoamingRabbit = BunnyCompanion;
