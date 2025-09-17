const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const loginContainer = document.getElementById('login-container');
const signupContainer = document.getElementById('signup-container');

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

const showSignupLink = document.getElementById('show-signup');
const showLoginLink = document.getElementById('show-login');

const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

const signupUsernameInput = document.getElementById('signup-username');
const signupPasswordInput = document.getElementById('signup-password');
const confirmPasswordInput = document.getElementById('confirm-password');

let ws = null;
let players = {};
let orbs = [];
let myId = null;
let lastMove = {};
let lastSendTime = 0;
const sendInterval = 20;
const PLAYER_SPEED = 5;
const PLAYER_RADIUS = 15;

let targetX = null;
let targetY = null;

// ページ読み込み時にログインフォームを表示
loginContainer.style.display = 'block';

// 「Sign up!」リンクをクリックしたときの処理
showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginContainer.style.display = 'none';
    signupContainer.style.display = 'block';
});

// 「Log in」リンクをクリックしたときの処理
showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signupContainer.style.display = 'none';
    loginContainer.style.display = 'block';
});

// WebSocket接続を開始する関数
function startWebSocketConnection() {
    ws = new WebSocket(`wss://${window.location.host}`);
    setupWebSocketEvents();
}

// WebSocketイベントリスナーをセットアップする関数
function setupWebSocketEvents() {
    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        
        // ログイン応答の処理
        if (data.type === 'login_response') {
            if (data.success) {
                myId = data.id;
                // ログインフォームを非表示にし、ゲームを開始
                loginContainer.style.display = 'none';
                canvas.style.display = 'block';
                // ゲームループを開始
                if (!window.gameLoopRunning) {
                    window.gameLoopRunning = true;
                    gameLoop();
                }
            } else {
                alert(data.message);
            }
        }
        
        // 登録応答の処理
        else if (data.type === 'signup_response') {
            alert(data.message);
            if (data.success) {
                // 登録成功後、ログインフォームに戻る
                signupContainer.style.display = 'none';
                loginContainer.style.display = 'block';
            }
        }
        
        // 既存のゲームロジック
        else if (data.type === 'init') {
            // このメッセージはログイン後に受け取る
            for (const playerId in data.players) {
                players[playerId] = { ...data.players[playerId], body: data.players[playerId].body || [] };
            }
            orbs = data.orbs || [];
        } else if (data.type === 'player_update') {
            if (!players[data.id]) {
                players[data.id] = { x: data.x, y: data.y, hp: data.hp, body: [] };
            } else {
                players[data.id].x = data.x;
                players[data.id].y = data.y;
                players[data.id].hp = data.hp;
            }
        } else if (data.type === 'all_player_update') {
            for (const id in data.players) {
                if (!players[id]) {
                    players[id] = { ...data.players[id], body: data.players[id].body || [] };
                }
            }
            for (const id in players) {
                if (data.players[id]) {
                    players[id].x = data.players[id].x;
                    players[id].y = data.players[id].y;
                    players[id].body = data.players[id].body;
                    players[id].length = data.players[id].length;
                } else if (id !== myId) {
                    delete players[id];
                }
            }
            orbs = data.orbs || [];
        } else if (data.type === 'remove_player') {
            delete players[data.id];
        } else if (data.type === 'player_died') {
            if (players[data.id]) {
                players[data.id].x = 100;
                players[data.id].y = 100;
                players[data.id].body = [];
                players[data.id].length = 10;
            }
        } else if (data.type === 'move') {
            if (players[data.id] && data.id !== myId) {
                players[data.id].x = data.x;
                players[data.id].y = data.y;
                players[data.id].body = data.body;
                players[data.id].length = data.length;
            }
        } else if (data.type === 'orb_eaten') {
            orbs = orbs.filter(orb => orb.id !== data.orbId);
        }
    };
}

// ログインフォームの送信イベント
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = usernameInput.value;
    const password = passwordInput.value;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        startWebSocketConnection();
        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({ type: 'login', username: username, password: password }));
        });
    } else {
        ws.send(JSON.stringify({ type: 'login', username: username, password: password }));
    }
});

// 登録フォームの送信イベント
signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = signupUsernameInput.value;
    const password = signupPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (password !== confirmPassword) {
        alert('Passwords do not match.');
        return;
    }
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        startWebSocketConnection();
        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({ type: 'signup', username: username, password: password }));
        });
    } else {
        ws.send(JSON.stringify({ type: 'signup', username: username, password: password }));
    }
});

document.addEventListener('mousedown', e => {
    if (myId) {
        targetX = e.clientX;
        targetY = e.clientY;
    }
});
document.addEventListener('touchstart', e => {
    if (myId) {
        targetX = e.touches[0].clientX;
        targetY = e.touches[0].clientY;
    }
});
document.addEventListener('mouseup', () => {
    if (myId) {
        targetX = null;
        targetY = null;
    }
});
document.addEventListener('touchend', () => {
    if (myId) {
        targetX = null;
        targetY = null;
    }
});

function gameLoop() {
    if (loginContainer.style.display !== 'none' || signupContainer.style.display !== 'none') {
        requestAnimationFrame(gameLoop);
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (ws && ws.readyState === WebSocket.OPEN) {
        orbs.forEach(orb => {
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = orb.color;
            ctx.fill();
            ctx.closePath();
        });

        for (let id in players) {
            const player = players[id];
            
            if (id === myId && targetX !== null && targetY !== null) {
                const dx = targetX - player.x;
                const dy = targetY - player.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > 5) {
                    const angle = Math.atan2(dy, dx);
                    player.x += Math.cos(angle) * PLAYER_SPEED;
                    player.y += Math.sin(angle) * PLAYER_SPEED;

                    player.body.push({ x: player.x, y: player.y });
                    while (player.body.length > player.length) {
                        player.body.shift();
                    }
                }
            }

            if (id === myId && (Date.now() - lastSendTime > sendInterval)) {
                const currentMove = { x: player.x, y: player.y, body: player.body };
                if (JSON.stringify(currentMove) !== JSON.stringify(lastMove)) {
                    ws.send(JSON.stringify({
                        type: 'move',
                        id: myId,
                        x: player.x,
                        y: player.y,
                        body: player.body
                    }));
                    lastMove = currentMove;
                    lastSendTime = Date.now();
                }
            }

            if (player.body.length > 0) {
                for (let i = 0; i < player.body.length; i++) {
                    const segment = player.body[i];
                    ctx.beginPath();
                    ctx.arc(segment.x, segment.y, 10, 0, Math.PI * 2);
                    ctx.fillStyle = (id === myId) ? 'blue' : 'red';
                    ctx.fill();
                    ctx.closePath();
                }
            }
        }
    }
    
    requestAnimationFrame(gameLoop);
}