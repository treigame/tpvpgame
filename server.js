const WebSocket = require('ws');

// WebSocketサーバーをポート10000で起動
const wss = new WebSocket.Server({ port: 10000 });

// プレイヤー情報を格納するオブジェクト
let players = {};

// 新規プレイヤーに割り当てるID
let nextId = 0;

// クライアントからの接続をリッスン
wss.on('connection', ws => {
    // 新しいプレイヤーのIDを生成し、情報を初期化
    const id = nextId++;
    players[id] = { x: 50, y: 50, hp: 100 };
    ws.id = id;

    // 接続したクライアントに自身のIDと現在の全プレイヤー情報を送信
    ws.send(JSON.stringify({ type: 'init', id: id, players: players }));

    // 他の全クライアントに新しいプレイヤーの情報をブロードキャスト
    broadcast({
        type: 'player_update',
        id: id,
        x: players[id].x,
        y: players[id].y,
        hp: players[id].hp
    });

    // クライアントからのメッセージを受信
    ws.on('message', message => {
        try {
            const data = JSON.parse(message);

            // メッセージタイプが'move'の場合
            if (data.type === 'move') {
                // プレイヤーの新しい位置を更新
                if (players[data.id]) {
                    players[data.id].x = data.x;
                    players[data.id].y = data.y;
                }
                // 全クライアントにプレイヤーの位置更新をブロードキャスト
                broadcast({
                    type: 'player_update',
                    id: data.id,
                    x: data.x,
                    y: data.y,
                    hp: players[data.id].hp
                });
            // メッセージタイプが'attack'の場合
            } else if (data.type === 'attack') {
                const targetId = data.targetId;
                if (players[targetId]) {
                    // ターゲットのHPを減らす
                    players[targetId].hp -= 10;
                    console.log(`プレイヤー ${ws.id} がプレイヤー ${targetId} に攻撃しました。`);
                    
                    // 全クライアントにターゲットのHP更新をブロードキャスト
                    broadcast({
                        type: 'hp_update',
                        id: targetId,
                        hp: players[targetId].hp
                    });

                    // ターゲットのHPが0以下になった場合
                    if (players[targetId].hp <= 0) {
                        // プレイヤー死亡メッセージをブロードキャスト
                        broadcast({ type: 'player_died', id: targetId });
                        // サーバーからプレイヤー情報を削除
                        delete players[targetId];
                    }
                }
            }
        } catch (error) {
            console.error('メッセージの解析に失敗しました:', error);
        }
    });

    // クライアントが切断した場合
    ws.on('close', () => {
        // プレイヤー情報を削除
        delete players[ws.id];
        // 他の全クライアントにプレイヤーの削除をブロードキャスト
        broadcast({ type: 'remove_player', id: ws.id });
        console.log(`クライアント ${ws.id} が切断しました`);
    });
});

/**
 * 全ての接続中のクライアントにメッセージをブロードキャストする関数
 * @param {Object} message - 送信するメッセージオブジェクト
 * @param {WebSocket} [sender=null] - メッセージを送信したクライアント（送信元には送らない）
 */
function broadcast(message, sender = null) {
    const jsonMessage = JSON.stringify(message);
    wss.clients.forEach(client => {
        // 接続が確立しており、送信元でないクライアントにメッセージを送信
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(jsonMessage);
        }
    });
}

console.log('サーバーが10000ポートで起動しました');