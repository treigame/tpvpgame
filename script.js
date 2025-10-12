// script.js の続き (前半部分の後に追加)

function showExclamationMark() {
    let exclamation = document.getElementById('exclamation-mark');
    if (exclamation) {
        exclamation.style.display = 'block';
    } else {
        exclamation = document.createElement('div');
        exclamation.id = 'exclamation-mark';
        exclamation.innerHTML = '❗';
        exclamation.style.cssText = `
            position: fixed;
            top: 40%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 60px;
            color: #ff0000;
            z-index: 2000;
            cursor: pointer;
            animation: pulse 0.5s infinite alternate;
        `;
        
        exclamation.addEventListener('click', () => {
            if (showExclamation && myId !== oniId) {
                ws.send(JSON.stringify({ type: 'become_oni', playerId: myId }));
            }
        });
        
        document.body.appendChild(exclamation);
    }
}

function hideExclamationMark() {
    const exclamation = document.getElementById('exclamation-mark');
    if (exclamation) {
        exclamation.style.display = 'none';
    }
}

function createSettingsUI() {
    const settingsButton = document.createElement('div');
    settingsButton.id = 'settings-button';
    settingsButton.innerHTML = '⚙️';
    settingsButton.style.cssText = `
        position: fixed;
        top: 20px;
        right: 180px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 10px 15px;
        border-radius: 8px;
        border: 2px solid #ffffff;
        cursor: pointer;
        font-size: 20px;
        z-index: 1001;
    `;
    
    const settingsMenu = document.createElement('div');
    settingsMenu.id = 'settings-menu';
    settingsMenu.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 20px;
        border-radius: 10px;
        border: 2px solid #ffffff;
        z-index: 1002;
        display: none;
        min-width: 200px;
    `;
    
    settingsMenu.innerHTML = `
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 15px;">設定</div>
        <div id="tablet-toggle" style="background: rgba(255, 255, 255, 0.1); padding: 10px; border-radius: 5px; cursor: pointer; border: 1px solid #ccc; text-align: center; margin-bottom: 10px;">📱 Tablet Mode</div>
        <div style="margin-bottom: 10px;">
            <a href="https://lin.ee/Pn7XBpd" target="_blank" style="display: block; text-align: center;">
                <img src="https://scdn.line-apps.com/n/line_add_friends/btn/en.png" alt="Add friend" height="36" border="0" style="border-radius: 4px;">
            </a>
        </div>
        <div><input type="text" id="code-input" placeholder="Code" style="width: 100%; padding: 8px; border-radius: 4px; margin-bottom: 5px;">
        <button id="code-submit" style="width: 100%; padding: 8px; border-radius: 4px; border: none; background: #007bff; color: white; cursor: pointer;">確認</button></div>
    `;
    
    document.body.appendChild(settingsButton);
    document.body.appendChild(settingsMenu);
    
    settingsButton.addEventListener('click', () => {
        const menu = document.getElementById('settings-menu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    
    document.addEventListener('click', (event) => {
        const menu = document.getElementById('settings-menu');
        const button = document.getElementById('settings-button');
        if (!menu.contains(event.target) && !button.contains(event.target)) {
            menu.style.display = 'none';
        }
    });
    
    document.getElementById('tablet-toggle').addEventListener('click', () => {
        isTabletMode = !isTabletMode;
        const toggle = document.getElementById('tablet-toggle');
        const gameUI = document.getElementById('game-ui');
        
        if (isTabletMode) {
            toggle.style.backgroundColor = 'rgba(0, 255, 0, 0.3)';
            toggle.innerHTML = '📱 Tablet Mode (ON)';
            if (gameUI) {
                gameUI.style.transform = 'scale(0.7)';
                gameUI.style.transformOrigin = 'top left';
            }
            createTouchControls();
        } else {
            toggle.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            toggle.innerHTML = '📱 Tablet Mode';
            if (gameUI) {
                gameUI.style.transform = 'scale(1)';
            }
            removeTouchControls();
        }
        document.getElementById('settings-menu').style.display = 'none';
    });
    
    document.getElementById('code-submit').addEventListener('click', () => {
        const code = document.getElementById('code-input').value.trim();
        if (code === 'trei0516') {
            playerRank = 'OWNER';
            flightEnabled = true;
            showMessage('OWNERランク付与', 'success', 3000);
            addRankDisplay(camera, 'OWNER');
            ws.send(JSON.stringify({ type: 'set_rank', playerId: myId, rank: 'OWNER' }));
            document.getElementById('code-input').value = '';
            document.getElementById('settings-menu').style.display = 'none';
        } else if (code !== '') {
            showMessage('無効なコード', 'error', 2000);
            document.getElementById('code-input').value = '';
        }
    });
}

function createTouchControls() {
    const joystickLeft = document.createElement('div');
    joystickLeft.id = 'joystick-left';
    joystickLeft.style.cssText = `
        position: fixed;
        bottom: 50px;
        left: 50px;
        width: 120px;
        height: 120px;
        background: rgba(255, 255, 255, 0.3);
        border: 3px solid rgba(255, 255, 255, 0.5);
        border-radius: 50%;
        z-index: 1000;
    `;
    
    const stickLeft = document.createElement('div');
    stickLeft.id = 'stick-left';
    stickLeft.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 50px;
        height: 50px;
        background: rgba(255, 255, 255, 0.7);
        border-radius: 50%;
    `;
    joystickLeft.appendChild(stickLeft);
    document.body.appendChild(joystickLeft);
    
    const jumpButton = document.createElement('div');
    jumpButton.id = 'jump-button';
    jumpButton.innerHTML = '↑';
    jumpButton.style.cssText = `
        position: fixed;
        bottom: 50px;
        right: 50px;
        width: 80px;
        height: 80px;
        background: rgba(0, 255, 0, 0.5);
        border: 3px solid rgba(0, 255, 0, 0.7);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        color: white;
        z-index: 1000;
        user-select: none;
    `;
    document.body.appendChild(jumpButton);
    
    const attackButton = document.createElement('div');
    attackButton.id = 'attack-button';
    attackButton.innerHTML = '⚔️';
    attackButton.style.cssText = `
        position: fixed;
        bottom: 150px;
        right: 50px;
        width: 80px;
        height: 80px;
        background: rgba(255, 0, 0, 0.5);
        border: 3px solid rgba(255, 0, 0, 0.7);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        color: white;
        z-index: 1000;
        user-select: none;
    `;
    document.body.appendChild(attackButton);
    
    let touchStartX = 0;
    let touchStartY = 0;
    
    joystickLeft.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = joystickLeft.getBoundingClientRect();
        touchStartX = rect.left + rect.width / 2;
        touchStartY = rect.top + rect.height / 2;
    });
    
    joystickLeft.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        
        const distance = Math.min(35, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
        const angle = Math.atan2(deltaY, deltaX);
        
        const stickX = Math.cos(angle) * distance;
        const stickY = Math.sin(angle) * distance;
        
        stickLeft.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;
        
        moveForward = deltaY < -10;
        moveBackward = deltaY > 10;
        moveLeft = deltaX < -10;
        moveRight = deltaX > 10;
    });
    
    joystickLeft.addEventListener('touchend', (e) => {
        e.preventDefault();
        stickLeft.style.transform = 'translate(-50%, -50%)';
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
    });
    
    jumpButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (canJump) {
            velocity.y += 18;
            canJump = false;
        }
    });
    
    attackButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (myId === oniId && gameStarted) {
            checkSwordHit();
        } else if (canThrowSnowball && myId !== oniId && gameStarted) {
            throwSnowball();
        }
    });
}

function removeTouchControls() {
    const joystick = document.getElementById('joystick-left');
    const jump = document.getElementById('jump-button');
    const attack = document.getElementById('attack-button');
    
    if (joystick) joystick.remove();
    if (jump) jump.remove();
    if (attack) attack.remove();
}

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());
controls.getObject().position.set(0, 1.7, 0);

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

document.addEventListener('click', () => {
    if (!document.pointerLockElement) {
        document.body.requestPointerLock();
    }
});

document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement && e.button === 0) {
        if (myId === oniId && gameStarted) {
            checkSwordHit();
        } else if (canThrowSnowball && myId !== oniId && gameStarted) {
            throwSnowball();
        }
    }
});

function checkSwordHit() {
    if (myId !== oniId) return;
    for (const id in players) {
        if (id === myId) continue;
        const distance = controls.getObject().position.distanceTo(players[id].position);
        if (distance < 4.0) {
            ws.send(JSON.stringify({ type: 'tag_player', id: myId, taggedId: id }));
            break;
        }
    }
}

function throwSnowball() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const playerPos = controls.getObject().position;
    const targetPos = playerPos.clone().add(dir.multiplyScalar(20));
    
    ws.send(JSON.stringify({
        type: 'throw_snowball',
        playerId: myId,
        startX: playerPos.x,
        startY: playerPos.y,
        startZ: playerPos.z,
        targetX: targetPos.x,
        targetY: targetPos.y,
        targetZ: targetPos.z
    }));
    
    canThrowSnowball = false;
    gameState.redItemsCollected = 0;
    gameState.score += 100;
    updateUI();
}

document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveForward = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveLeft = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveBackward = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveRight = true;
            break;
        case 'Space':
            event.preventDefault();
            if (flightEnabled && isFlying) {
                velocity.y += 15;
            } else if (canJump) {
                velocity.y += 18;
                canJump = false;
            }
            break;
        case 'ShiftLeft':
            if (flightEnabled && isFlying) velocity.y -= 15;
            break;
        case 'KeyF':
            if (flightEnabled && playerRank === 'OWNER') {
                isFlying = !isFlying;
                showMessage(isFlying ? 'フライト有効' : 'フライト無効', 'success', 2000);
            }
            break;
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveForward = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveLeft = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveBackward = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveRight = false;
            break;
    }
});

let lastSentPosition = new THREE.Vector3();
let lastSentTime = 0;

function sendPositionUpdate() {
    if (!isConnected || !myId) return;
    const currentTime = performance.now();
    const currentPosition = controls.getObject().position;
    
    if (currentTime - lastSentTime > 50 && currentPosition.distanceTo(lastSentPosition) > 0.1) {
        ws.send(JSON.stringify({ type: 'move', id: myId, x: currentPosition.x, y: currentPosition.y, z: currentPosition.z }));
        lastSentPosition.copy(currentPosition);
        lastSentTime = currentTime;
    }
}

function updateUI() {
    const currentTime = Date.now();
    const gameTime = Math.floor((currentTime - gameState.gameStartTime) / 1000);
    const minutes = Math.floor(gameTime / 60);
    const seconds = gameTime % 60;
    
    if (document.getElementById('player-id')) {
        document.getElementById('player-id').textContent = myId;
        document.getElementById('role').textContent = myId === oniId ? '👹 鬼' : '🏃 逃走者';
        document.getElementById('score').textContent = gameState.score;
        document.getElementById('game-time').textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const redItemsElement = document.getElementById('red-items');
        if (redItemsElement) redItemsElement.textContent = gameState.redItemsCollected;
        
        const redItemsCountElement = document.getElementById('red-items-count');
        if (redItemsCountElement) redItemsCountElement.style.display = myId !== oniId ? 'block' : 'none';
        
        const snowballStatusElement = document.getElementById('snowball-status');
        if (snowballStatusElement) snowballStatusElement.style.display = canThrowSnowball ? 'block' : 'none';
    }
    
    updateMinimap();
}

function updateMinimap() {
    if (!gameState.minimapCtx) return;
    const ctx = gameState.minimapCtx;
    const canvas = gameState.minimapCanvas;
    
    ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const mapSize = 200;
    const scale = canvas.width / mapSize;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const playerPos = controls.getObject().position;
    
    ctx.fillStyle = '#8B4513';
    blocks.forEach(block => {
        const x = centerX + (block.position.x - playerPos.x) * scale;
        const y = centerY + (block.position.z - playerPos.z) * scale;
        const size = 4;
        if (x > -size && x < canvas.width + size && y > -size && y < canvas.height + size) {
            ctx.fillRect(x - size/2, y - size/2, size, size);
        }
    });
    
    ctx.fillStyle = '#ff0000';
    for (const id in redItems) {
        const item = redItems[id];
        const x = centerX + (item.position.x - playerPos.x) * scale;
        const y = centerY + (item.position.z - playerPos.z) * scale;
        if (x > 0 && x < canvas.width && y > 0 && y < canvas.height) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
    
    for (const id in players) {
        const player = players[id];
        const x = centerX + (player.position.x - playerPos.x) * scale;
        const y = centerY + (player.position.z - playerPos.z) * scale;
        if (x > 0 && x < canvas.width && y > 0 && y < canvas.height) {
            ctx.fillStyle = id === oniId ? '#0000ff' : '#00ff00';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
    
    ctx.fillStyle = myId === oniId ? '#0000ff' : '#00ff00';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
    ctx.fill();
}

function showMessage(text, type = 'info', duration = 3000) {
    let container = document.getElementById('message-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'message-container';
        container.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 3000; max-width: 400px; pointer-events: none;';
        document.body.appendChild(container);
    }
    
    const msg = document.createElement('div');
    msg.style.cssText = `background: ${type === 'success' ? 'rgba(0, 255, 0, 0.8)' : type === 'error' ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 123, 255, 0.8)'}; color: white; padding: 10px 15px; margin: 5px 0; border-radius: 5px; font-weight: bold;`;
    msg.textContent = text;
    container.appendChild(msg);
    
    setTimeout(() => {
        if (msg.parentNode) container.removeChild(msg);
    }, duration);
}

function checkCollisions(targetPosition) {
    const playerRadius = 1.0;
    for (const block of blocks) {
        const blockBox = new THREE.Box3().setFromObject(block);
        const playerBox = new THREE.Box3().setFromCenterAndSize(targetPosition, new THREE.Vector3(playerRadius * 2, 3.4, playerRadius * 2));
        if (blockBox.intersectsBox(playerBox)) return true;
    }
    return false;
}

function checkRedItemCollection() {
    if (!gameStarted) return;
    const playerPosition = controls.getObject().position;
    for (const id in redItems) {
        const item = redItems[id];
        if (playerPosition.distanceTo(item.position) < 2.0) {
            ws.send(JSON.stringify({ type: 'collect_red_item', playerId: myId, itemId: id }));
            break;
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    if (!isConnected) {
        renderer.render(scene, camera);
        return;
    }
    
    if (isFlying && flightEnabled) {
        handleFlightMovement();
    } else if (gameCountdown > 0 || waitingForPlayers) {
        handleNormalMovement();
        if (controls.getObject().position.y < 1.7) {
            controls.getObject().position.y = 1.7;
            velocity.y = 0;
            canJump = true;
        }
    } else if (gameStarted && isSpawned) {
        handleNormalMovement();
        
        const mapLimit = 98;
        const pos = controls.getObject().position;
        if (pos.x < -mapLimit) pos.x = -mapLimit;
        if (pos.x > mapLimit) pos.x = mapLimit;
        if (pos.z < -mapLimit) pos.z = -mapLimit;
        if (pos.z > mapLimit) pos.z = mapLimit;
        
        checkRedItemCollection();
    } else {
        handleNormalMovement();
        if (controls.getObject().position.y < 1.7) {
            controls.getObject().position.y = 1.7;
            velocity.y = 0;
            canJump = true;
        }
    }
    
    sendPositionUpdate();
    updateUI();
    renderer.render(scene, camera);
    
    const time = Date.now() * 0.001;
    for (const id in redItems) {
        const item = redItems[id];
        item.rotation.y = time;
        if (!item.userData.originalY) item.userData.originalY = item.position.y;
        item.position.y = item.userData.originalY + Math.sin(time * 2) * 0.3;
    }
    
    for (const id in players) {
        if (players[id].rankDisplay) {
            players[id].rankDisplay.lookAt(camera.position);
        }
    }
}

function handleFlightMovement() {
    const inputDir = new THREE.Vector3();
    if (moveForward) inputDir.z -= 1;
    if (moveBackward) inputDir.z += 1;
    if (moveLeft) inputDir.x -= 1;
    if (moveRight) inputDir.x += 1;
    if (inputDir.length() > 0) inputDir.normalize();
    
    const speed = 20.0;
    const deltaTime = 1/60;
    const currentPos = controls.getObject().position.clone();
    
    if (inputDir.z !== 0) {
        const moveVector = new THREE.Vector3();
        controls.getObject().getWorldDirection(moveVector);
        moveVector.y = 0;
        moveVector.normalize();
        moveVector.multiplyScalar(inputDir.z * speed * deltaTime);
        currentPos.add(moveVector);
    }
    
    if (inputDir.x !== 0) {
        const strafeVector = new THREE.Vector3();
        controls.getObject().getWorldDirection(strafeVector);
        strafeVector.cross(controls.getObject().up);
        strafeVector.y = 0;
        strafeVector.normalize();
        strafeVector.multiplyScalar(inputDir.x * speed * deltaTime);
        currentPos.add(strafeVector);
    }
    
    controls.getObject().position.x = currentPos.x;
    controls.getObject().position.z = currentPos.z;
    velocity.y *= 0.9;
    controls.getObject().position.y += velocity.y * (1/60);
}

function handleNormalMovement() {
    const inputDir = new THREE.Vector3();
    if (moveForward) inputDir.z -= 1;
    if (moveBackward) inputDir.z += 1;
    if (moveLeft) inputDir.x -= 1;
    if (moveRight) inputDir.x += 1;
    if (inputDir.length() > 0) inputDir.normalize();
    
    const speed = 15.0;
    const deltaTime = 1/60;
    
    const forward = new THREE.Vector3();
    controls.getObject().getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    
    const right = new THREE.Vector3();
    right.crossVectors(forward, controls.getObject().up).normalize();
    
    const moveVector = new THREE.Vector3();
    moveVector.addScaledVector(forward, inputDir.z * speed * deltaTime);
    moveVector.addScaledVector(right, inputDir.x * speed * deltaTime);
    
    const currentPos = controls.getObject().position.clone();
    const newPos = currentPos.clone().add(moveVector);
    newPos.y = currentPos.y;
    
    if (!checkCollisions(newPos)) {
        controls.getObject().position.x = newPos.x;
        controls.getObject().position.z = newPos.z;
    }
    
    velocity.y -= 50.0 * deltaTime;
    
    if (controls.getObject().position.y <= 1.7) {
        velocity.y = 0;
        controls.getObject().position.y = 1.7;
        canJump = true;
    }
    
    controls.getObject().position.y += velocity.y * deltaTime;
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();