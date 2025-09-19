const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = {};
let redItems = {}; // 赤いアイテム（オーブの代替）
let snowballs = {}; // 投げられた雪玉
let oniId = null;
const RED_ITEM_COUNT = 20; // 赤いアイテムの数
let playerCounter = 0;
let snowballCounter = 0;

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

// オーブ生成関数（建物を考慮）
function generateOrbs() {
    orbs = {};
    const BOUNDARY = 80;
    const MIN_DISTANCE = 8;
    const BUILDING_RADIUS = 25; // 建物の影響範囲
    
    for (let i = 0; i < ORB_COUNT; i++) {
        let x, z, attempts = 0;
        let validPosition = false;
        
        while (!validPosition && attempts < 100) {
            x = (Math.random() - 0.5) * BOUNDARY * 2;
            z = (Math.random() - 0.5) * BOUNDARY * 2;
            
            validPosition = true;
            
            // 建物の中心部を避ける（1階の広間は除く）
            const distanceFromCenter = Math.sqrt(x * x + z * z);
            if (distanceFromCenter < BUILDING_RADIUS) {
                // 1階の広間（中央部分）はOK、建物の壁部分は避ける
                if (distanceFromCenter > 15) {
                    validPosition = false;
                    attempts++;
                    continue;
                }
            }
            
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
    
    console.log(`${ORB_COUNT}個のオーブを生成しました（建物配慮版）`);
}

// パワーアップ生成関数（建物を考慮）
function generatePowerUps() {
    powerUps = {};
    const BOUNDARY = 70;
    const MIN_DISTANCE = 15;
    const BUILDING_RADIUS = 25;
    
    for (let i = 0; i < POWERUP_COUNT; i++) {
        let x, z, attempts = 0;
        let validPosition = false;
        
        while (!validPosition && attempts < 100) {
            x = (Math.random() - 0.5) * BOUNDARY * 2;
            z = (Math.random() - 0.5) * BOUNDARY * 2;
            
            validPosition = true;
            
            // 建物の中心部を避ける
            const distanceFromCenter = Math.sqrt(x * x + z * z);
            if (distanceFromCenter < BUILDING_RADIUS) {
                if (distanceFromCenter > 15) {
                    validPosition = false;
                    attempts++;
                    continue;
                }
            }
            
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
    
    console.log(`${POWERUP_COUNT}個のパワーアップを生成しました（建物配慮版）`);
}bs[existingOrbId];
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

// 雪玉の当たり判定
function checkSnowballHit(snowballId, snowball) {
    if (!snowballs[snowballId]) return;
    
    const targetPos = { x: snowball.targetX, y: snowball.targetY, z: snowball.targetZ };
    
    // 鬼との距離をチェック
    if (players[oniId]) {
        const oniPos = players[oniId];
        const distance = Math.sqrt(
            Math.pow(targetPos.x - oniPos.x, 2) + 
            Math.pow(targetPos.z - oniPos.z, 2)
        );
        
        if (distance < 3) { // 3ユニット以内で命中
            broadcast({ 
                type: 'snowball_hit', 
                snowballId: snowballId,
                hitPlayerId: oniId
            });
            
            console.log(`雪玉が鬼 ${oniId} に命中！ゲームオーバー！`);
            
            // ゲームリセット（3秒後）
            setTimeout(() => {
                resetGame();
            }, 3000);
        }
    }
    
    // 雪玉を削除
    delete snowballs[snowballId];
}

// ゲームリセット
function resetGame() {
    console.log('ゲームをリセットします...');
    
    // 全プレイヤーにリセット通知
    broadcast({ type: 'game_reset' });
    
    // ゲーム状態をリセット
    generateRedItems();
    snowballs = {};
    snowballCounter = 0;
    
    // 新しい鬼を選択
    selectRandomOni();
    
    broadcast({ 
        type: 'game_restarted',
        redItems: redItems,
        oniId: oniId
    });
}
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
generateRedItems();

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
                        redItems: redItems,
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
                    
                case 'collect_red_item':
                    if (redItems[data.itemId]) {
                        delete redItems[data.itemId];
                        players[id].score += 10;
                        broadcast({ 
                            type: 'red_item_collected', 
                            itemId: data.itemId,
                            playerId: id
                        });
                        console.log(`赤いアイテム ${data.itemId} が ${id} によって取得されました`);
                        
                        // すべての赤いアイテムが取得された場合、新しいアイテムを生成
                        if (Object.keys(redItems).length === 0) {
                            console.log('すべての赤いアイテムが取得されました。新しいアイテムを生成します。');
                            generateRedItems();
                            broadcast({ type: 'items_respawned', redItems: redItems });
                        }
                    }
                    break;

                case 'throw_snowball':
                    if (id !== oniId) { // 鬼以外が投げる場合のみ
                        const snowballId = `snowball_${snowballCounter++}`;
                        const snowball = {
                            id: snowballId,
                            playerId: id,
                            x: data.startX,
                            y: data.startY,
                            z: data.startZ,
                            targetX: data.targetX,
                            targetY: data.targetY,
                            targetZ: data.targetZ,
                            startTime: Date.now()
                        };
                        
                        snowballs[snowballId] = snowball;
                        broadcast({ 
                            type: 'snowball_thrown', 
                            snowballId: snowballId,
                            snowball: snowball
                        });
                        
                        console.log(`雪玉 ${snowballId} が ${id} によって投げられました`);
                        
                        // 雪玉の当たり判定（簡易版）
                        setTimeout(() => {
                            checkSnowballHit(snowballId, snowball);
                        }, 1000); // 1秒後に当たり判定
                    }
                    break;

                case 'show_exclamation':
                    // ！マーク表示要求
                    broadcast({ 
                        type: 'show_exclamation', 
                        playerId: data.playerId 
                    });
                    break;

                case 'hide_exclamation':
                    // ！マーク非表示要求
                    broadcast({ 
                        type: 'hide_exclamation', 
                        playerId: data.playerId 
                    });
                    break;

                case 'become_oni':
                    // ！マーククリックで鬼交代
                    if (data.playerId !== oniId) {
                        const oldOni = oniId;
                        oniId = data.playerId;
                        
                        broadcast({ type: 'oni_changed', oniId: oniId });
                        console.log(`！マーククリックで鬼が交代しました: ${oldOni} → ${oniId}`);
                    }
                    break;
                    
                case 'tag_player':
                    // 直接タッチによる鬼交代は削除
                    // 新システムでは！マーククリックのみで交代
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

// パワーアップの定期生成を削除
// const powerUpSpawnInterval = setInterval(() => { ... }, 30000);

// ゲーム統計の定期出力（10分間隔）
const statsInterval = setInterval(() => {
    console.log('=== ゲーム統計 ===');
    console.log(`プレイヤー数: ${Object.keys(players).length}`);
    console.log(`赤いアイテム数: ${Object.keys(redItems).length}`);
    console.log(`雪玉数: ${Object.keys(snowballs).length}`);
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
    console.log(`🎯 赤いアイテム数: ${RED_ITEM_COUNT}`);
    console.log(`❄️ 雪玉システム有効`);
    console.log(`=================================`);
});