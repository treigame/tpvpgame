const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = {};
let orbs = {};
let powerUps = {};
let oniId = null;
const ORB_COUNT = 30;
const POWERUP_COUNT = 8;
let playerCounter = 0;
let powerUpCounter = 0;

// パワーアップの種類
const POWER_UP_TYPES = ['SPEED_BOOST', 'INVISIBLE', 'SHIELD', 'JUMP_BOOST'];

// プレイヤーデータの検証関数
function isValidPosition(x, y, z) {
    const BOUNDARY = 95;
    return x >= -BOUNDARY && x <= BOUNDARY && 
           z >= -BOUNDARY && z <= BOUNDARY && 
           y >= 0 && y <= 50;
}

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, '')));

const port = process.env.PORT || 10000;

// ブロードキャスト関数
function broadcast(message, excludeId = null) {
    const jsonMessage = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.playerId !== excludeId) {
            try {
                client.send(jsonMessage);
            } catch (error) {
                console.error(`プレイヤー ${client.playerId} への送信に失敗:`, error);
            }
        }
    });
}

// 特定のプレイヤーにメッセージを送信
function sendToPlayer(playerId, message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.playerId === playerId) {
            try {
                client.send(JSON.stringify(message));
            } catch (error) {
                console.error(`プレイヤー ${playerId} への送信に失敗:`, error);
            }
        }
    });
}

// オーブ生成関数
function generateOrbs() {
    orbs = {};
    const BOUNDARY = 80;
    const MIN_DISTANCE = 8;
    
    for (let i = 0; i < ORB_COUNT; i++) {
        let x, z, attempts = 0;
        let validPosition = false;
        
        while (!validPosition && attempts < 100) {
            x = (Math.random() - 0.5) * BOUNDARY * 2;
            z = (Math.random() - 0.5) * BOUNDARY * 2;
            
            validPosition = true;
            
            // 他のオーブとの距離をチェック
            for (const existingOrbId in orbs) {
                const existingOrb = orbs[existingOrbId];
                const distance = Math.sqrt(
                    Math.pow(x - existingOrb.x, 2) + 
                    Math.pow(z - existingOrb.z, 2)
                );
                
                if (distance < MIN_DISTANCE) {
                    validPosition = false;
                    break;
                }
            }
            
            // パワーアップとの距離もチェック
            for (const existingPowerUpId in powerUps) {
                const existingPowerUp = powerUps[existingPowerUpId];
                const distance = Math.sqrt(
                    Math.pow(x - existingPowerUp.x, 2) + 
                    Math.pow(z - existingPowerUp.z, 2)
                );
                
                if (distance < MIN_DISTANCE) {
                    validPosition = false;
                    break;
                }
            }
            
            attempts++;
        }
        
        const orbId = `orb_${i}`;
        orbs[orbId] = {
            id: orbId,
            x: x || (Math.random() - 0.5) * BOUNDARY,
            y: 0.5,
            z: z || (Math.random() - 0.5) * BOUNDARY,
        };
    }
    
    console.log(`${ORB_COUNT}個のオーブを生成しました`);
}

// パワーアップ生成関数
function generatePowerUps() {
    powerUps = {};
    const BOUNDARY = 70;
    const MIN_DISTANCE = 15;
    
    for (let i = 0; i < POWERUP_COUNT; i++) {
        let x, z, attempts = 0;
        let validPosition = false;
        
        while (!validPosition && attempts < 100) {
            x = (Math.random() - 0.5) * BOUNDARY * 2;
            z = (Math.random() - 0.5) * BOUNDARY * 2;
            
            validPosition = true;
            
            // 他のパワーアップとの距離をチェック
            for (const existingPowerUpId in powerUps) {
                const existingPowerUp = powerUps[existingPowerUpId];
                const distance = Math.sqrt(
                    Math.pow(x - existingPowerUp.x, 2) + 
                    Math.pow(z - existingPowerUp.z, 2)
                );
                
                if (distance < MIN_DISTANCE) {
                    validPosition = false;
                    break;
                }
            }
            
            // オーブとの距離もチェック
            for (const existingOrbId in orbs) {
                const existingOrb = orbs[existingOrbId];
                const distance = Math.sqrt(
                    Math.pow(x - existingOrb.x, 2) + 
                    Math.pow(z - existingOrb.z, 2)
                );
                
                if (distance < MIN_DISTANCE) {
                    validPosition = false;
                    break;
                }
            }
            
            attempts++;
        }
        
        const powerUpId = `powerup_${powerUpCounter++}`;
        const randomType = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
        
        powerUps[powerUpId] = {
            id: powerUpId,
            type: randomType,
            x: x || (Math.random() - 0.5) * BOUNDARY,
            y: 1.0,
            z: z || (Math.random() - 0.5) * BOUNDARY,
        };
    }
    
    console.log(`${POWERUP_COUNT}個のパワーアップを生成しました`);
}

// 新しいパワーアップを単体で生成
function spawnRandomPowerUp() {
    const BOUNDARY = 70;
    const MIN_DISTANCE = 15;
    let attempts = 0;
    let x, z;
    let validPosition = false;
    
    while (!validPosition && attempts < 50) {
        x = (Math.random() - 0.5) * BOUNDARY * 2;
        z = (Math.random() - 0.5) * BOUNDARY * 2;
        
        validPosition = true;
        
        // 既存のアイテムとの距離をチェック
        for (const existingId in {...orbs, ...powerUps}) {
            const existing = orbs[existingId] || powerUps[existingId];
            const distance = Math.sqrt(
                Math.pow(x - existing.x, 2) + 
                Math.pow(z - existing.z, 2)
            );
            
            if (distance < MIN_DISTANCE) {
                validPosition = false;
                break;
            }
        }
        
        attempts++;
    }
    
    if (validPosition) {
        const powerUpId = `powerup_${powerUpCounter++}`;
        const randomType = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
        
        const newPowerUp = {
            id: powerUpId,
            type: randomType,
            x: x,
            y: 1.0,
            z: z,
        };
        
        powerUps[powerUpId] = newPowerUp;
        
        broadcast({
            type: 'powerup_spawned',
            id: powerUpId,
            powerUp: newPowerUp
        });
        
        console.log(`新しいパワーアップが生成されました: ${powerUpId} (${randomType})`);
    }
}

// 初期生成
generateOrbs();
generatePowerUps();

// 鬼の自動選択
function selectRandomOni() {
    const playerIds = Object.keys(players);
    if (playerIds.length > 0) {
        const newOniId = playerIds[Math.floor(Math.random() * playerIds.length)];
        if (oniId !== newOniId) {
            oniId = newOniId;
            broadcast({ type: 'oni_changed', oniId: oniId });
            console.log(`新しい鬼が選ばれました: ${oniId}`);
        }
    } else {
        oniId = null;
    }
}

// プレイヤーの位置更新レート制限
const playerUpdateLimits = new Map();
const UPDATE_RATE_LIMIT = 20;

function canUpdatePlayer(playerId) {
    const now = Date.now();
    const lastUpdate = playerUpdateLimits.get(playerId) || 0;
    
    if (now - lastUpdate >= UPDATE_RATE_LIMIT) {
        playerUpdateLimits.set(playerId, now);
        return true;
    }
    return false;
}

// WebSocket接続処理
wss.on('connection', (ws, req) => {
    const id = `player_${playerCounter++}`;
    const clientIP = req.socket.remoteAddress;
    
    // プレイヤーの初期化
    players[id] = { 
        id: id, 
        x: Math.random() * 20 - 10,
        y: 1.7, 
        z: Math.random() * 20 - 10,
        lastUpdate: Date.now(),
        score: 0
    };
    
    ws.playerId = id;
    console.log(`新しいプレイヤーが接続しました: ${id} (IP: ${clientIP})`);
    
    // 最初のプレイヤーまたは鬼が不在の場合、鬼に設定
    if (!oniId || Object.keys(players).length === 1) {
        oniId = id;
        console.log(`${id} が鬼に設定されました`);
    }
    
    // メッセージ処理
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'get_id':
                    // 初期化データを送信
                    ws.send(JSON.stringify({ 
                        type: 'init', 
                        id: id, 
                        players: players, 
                        orbs: orbs,
                        powerUps: powerUps,
                        oniId: oniId 
                    }));
                    
                    // 他のプレイヤーに新しいプレイヤーの参加を通知
                    broadcast({ 
                        type: 'player_update', 
                        id: id, 
                        x: players[id].x, 
                        y: players[id].y, 
                        z: players[id].z 
                    }, id);
                    break;
                    
                case 'move':
                    // レート制限チェック
                    if (!canUpdatePlayer(data.id)) {
                        return;
                    }
                    
                    const player = players[data.id];
                    if (player && data.id === id) {
                        // 位置データの検証
                        if (isValidPosition(data.x, data.y, data.z)) {
                            player.x = parseFloat(data.x);
                            player.y = parseFloat(data.y);
                            player.z = parseFloat(data.z);
                            player.lastUpdate = Date.now();
                            
                            // 他のプレイヤーに位置更新を送信
                            broadcast({ 
                                type: 'player_update', 
                                id: data.id, 
                                x: player.x, 
                                y: player.y, 
                                z: player.z 
                            }, id);
                        } else {
                            console.log(`不正な位置データを受信: ${id}`, data);
                        }
                    }
                    break;
                    
                case 'eat_orb':
                    if (orbs[data.orbId]) {
                        delete orbs[data.orbId];
                        players[id].score += 10;
                        broadcast({ type: 'orb_eaten', orbId: data.orbId });
                        console.log(`オーブ ${data.orbId} が ${id} によって取得されました`);
                        
                        // すべてのオーブが取得された場合、新しいオーブを生成
                        if (Object.keys(orbs).length === 0) {
                            console.log('すべてのオーブが取得されました。新しいオーブを生成します。');
                            generateOrbs();
                            broadcast({ type: 'orbs_respawned', orbs: orbs });
                        }
                    }
                    break;

                case 'collect_powerup':
                    if (powerUps[data.powerUpId]) {
                        const powerUpType = powerUps[data.powerUpId].type;
                        delete powerUps[data.powerUpId];
                        players[id].score += 50;
                        
                        broadcast({ 
                            type: 'powerup_collected', 
                            powerUpId: data.powerUpId,
                            playerId: id,
                            type: powerUpType
                        });
                        
                        console.log(`パワーアップ ${data.powerUpId} (${powerUpType}) が ${id} によって取得されました`);
                        
                        // 新しいパワーアップを遅延生成
                        setTimeout(() => {
                            spawnRandomPowerUp();
                        }, 5000 + Math.random() * 10000); // 5-15秒後
                    }
                    break;
                    
                case 'tag_player':
                    // 鬼ごっこの処理
                    if (data.id === oniId && data.id === id && players[data.taggedId]) {
                        const oldOni = oniId;
                        oniId = data.taggedId;
                        
                        // スコア更新
                        players[oldOni].score += 100; // 鬼が誰かにタッチした時のボーナス
                        
                        broadcast({ type: 'oni_changed', oniId: oniId });
                        console.log(`鬼が交代しました: ${oldOni} → ${oniId}`);
                    }
                    break;
                    
                default:
                    console.log(`未知のメッセージタイプ: ${data.type}`);
            }
        } catch (error) {
            console.error('メッセージの解析に失敗しました:', error);
        }
    });

    // プレイヤー切断処理
    ws.on('close', () => {
        console.log(`プレイヤーが切断しました: ${id}`);
        
        // プレイヤーデータを削除
        delete players[id];
        playerUpdateLimits.delete(id);
        
        // 他のプレイヤーに切断を通知
        broadcast({ type: 'remove_player', id: id });
        
        // 鬼が切断した場合の処理
        if (id === oniId) {
            console.log(`鬼が切断しました: ${id}`);
            selectRandomOni();
        }
        
        console.log(`現在のプレイヤー数: ${Object.keys(players).length}`);
    });

    // エラー処理
    ws.on('error', (error) => {
        console.error(`プレイヤー ${id} でエラーが発生しました:`, error);
    });

    // 接続のヘルスチェック
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
});

// 定期的なヘルスチェック（30秒間隔）
const healthCheckInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log(`非アクティブな接続を終了: ${ws.playerId}`);
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// 非アクティブプレイヤーのクリーンアップ（2分間隔）
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const INACTIVE_TIMEOUT = 5 * 60 * 1000; // 5分
    
    for (const playerId in players) {
        const player = players[playerId];
        if (now - player.lastUpdate > INACTIVE_TIMEOUT) {
            console.log(`非アクティブなプレイヤーを削除: ${playerId}`);
            delete players[playerId];
            playerUpdateLimits.delete(playerId);
            broadcast({ type: 'remove_player', id: playerId });
            
            if (playerId === oniId) {
                selectRandomOni();
            }
        }
    }
}, 2 * 60 * 1000);

// パワーアップの定期生成（30秒間隔）
const powerUpSpawnInterval = setInterval(() => {
    if (Object.keys(powerUps).length < POWERUP_COUNT) {
        spawnRandomPowerUp();
    }
}, 30000);

// ゲーム統計の定期出力（10分間隔）
const statsInterval = setInterval(() => {
    console.log('=== ゲーム統計 ===');
    console.log(`プレイヤー数: ${Object.keys(players).length}`);
    console.log(`オーブ数: ${Object.keys(orbs).length}`);
    console.log(`パワーアップ数: ${Object.keys(powerUps).length}`);
    console.log(`現在の鬼: ${oniId}`);
    console.log(`アクティブ接続数: ${wss.clients.size}`);
    
    // プレイヤースコアランキング
    const sortedPlayers = Object.values(players)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    
    console.log('=== トップ5プレイヤー ===');
    sortedPlayers.forEach((player, index) => {
        console.log(`${index + 1}. ${player.id}: ${player.score}点`);
    });
    console.log('========================');
}, 10 * 60 * 1000);

// グレースフルシャットダウン
function gracefulShutdown() {
    console.log('サーバーをシャットダウンしています...');
    
    clearInterval(healthCheckInterval);
    clearInterval(cleanupInterval);
    clearInterval(powerUpSpawnInterval);
    clearInterval(statsInterval);
    
    // すべてのクライアントに切断を通知
    broadcast({ type: 'server_shutdown', message: 'サーバーがメンテナンスのため停止します' });
    
    // 接続を閉じる
    wss.clients.forEach((ws) => {
        ws.close();
    });
    
    server.close(() => {
        console.log('サーバーが正常に停止しました');
        process.exit(0);
    });
}

// シグナルハンドリング
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 未処理のエラーをキャッチ
process.on('uncaughtException', (error) => {
    console.error('未処理の例外:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未処理のPromise拒否:', reason);
});

// サーバー起動
server.listen(port, () => {
    console.log(`=================================`);
    console.log(`🎮 3D鬼ごっこサーバーが起動しました`);
    console.log(`📍 ポート: ${port}`);
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log(`🎯 オーブ数: ${ORB_COUNT}`);
    console.log(`⚡ パワーアップ数: ${POWERUP_COUNT}`);
    console.log(`=================================`);
});