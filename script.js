const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

let myId = null;
let myColor = null;
let currentTurn = 'white';
let selectedSquare = null;
let gameState = null;
let isGameActive = false;

const pieceSymbols = {
    white: {
        king: '♔',
        queen: '♕',
        rook: '♖',
        bishop: '♗',
        knight: '♘',
        pawn: '♙'
    },
    black: {
        king: '♚',
        queen: '♛',
        rook: '♜',
        bishop: '♝',
        knight: '♞',
        pawn: '♟'
    }
};

ws.onopen = () => {
    console.log('WebSocket接続が確立されました');
    updateConnectionStatus('connected');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('受信データ:', data);
    
    switch (data.type) {
        case 'init':
            myId = data.id;
            myColor = data.color;
            gameState = data.gameState;
            currentTurn = data.currentTurn;
            isGameActive = data.isGameActive;
            
            console.log('初期化:', { myId, myColor, isGameActive });
            
            document.getElementById('player-id').textContent = myId;
            document.getElementById('player-color').textContent = myColor === 'white' ? '⚪ 白' : '⚫ 黒';
            
            hideLoadingScreen();
            
            if (!isGameActive) {
                showWaitingMessage(data.playerCount || 1);
            } else {
                hideWaitingMessage();
                initBoard();
                renderBoard();
                updateTurnDisplay();
            }
            break;
            
        case 'game_start':
            console.log('ゲーム開始');
            isGameActive = true;
            gameState = data.gameState;
            currentTurn = data.currentTurn;
            hideWaitingMessage();
            initBoard();
            renderBoard();
            updateTurnDisplay();
            showMessage('ゲーム開始！', 'success', 2000);
            break;
            
        case 'waiting':
            showWaitingMessage(data.playerCount);
            break;
            
        case 'move':
            gameState = data.gameState;
            currentTurn = data.currentTurn;
            renderBoard();
            updateTurnDisplay();
            updateCapturedPieces(data.captured);
            break;
            
        case 'invalid_move':
            showMessage('無効な手です', 'error', 2000);
            clearSelection();
            break;
            
        case 'game_over':
            isGameActive = false;
            showGameResult(data.winner, data.reason);
            break;
            
        case 'player_disconnected':
            showMessage('相手プレイヤーが切断しました', 'error', 3000);
            setTimeout(() => location.reload(), 3000);
            break;
    }
};

ws.onclose = () => {
    console.log('WebSocket接続が切断されました');
    updateConnectionStatus('disconnected');
    showMessage('サーバーとの接続が切断されました', 'error', 5000);
};

ws.onerror = (error) => {
    console.error('WebSocket エラー:', error);
    updateConnectionStatus('disconnected');
};

function initBoard() {
    console.log('盤面を初期化');
    const board = document.getElementById('chess-board');
    board.innerHTML = '';
    board.style.display = 'grid';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
            square.dataset.row = row;
            square.dataset.col = col;
            square.addEventListener('click', handleSquareClick);
            board.appendChild(square);
        }
    }
}

function renderBoard() {
    if (!gameState || !gameState.board) {
        console.log('ゲーム状態がありません');
        return;
    }
    
    console.log('盤面をレンダリング');
    const board = document.getElementById('chess-board');
    const squares = board.querySelectorAll('.square');
    
    squares.forEach((square, index) => {
        const row = Math.floor(index / 8);
        const col = index % 8;
        const piece = gameState.board[row][col];
        
        square.innerHTML = '';
        square.classList.remove('selected', 'valid-move', 'last-move');
        
        if (piece) {
            const pieceSpan = document.createElement('span');
            pieceSpan.className = 'piece';
            pieceSpan.textContent = pieceSymbols[piece.color][piece.type];
            square.appendChild(pieceSpan);
        }
    });
}

function handleSquareClick(event) {
    if (!isGameActive || currentTurn !== myColor) {
        console.log('クリック無効:', { isGameActive, currentTurn, myColor });
        return;
    }
    
    const square = event.currentTarget;
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const piece = gameState.board[row][col];
    
    console.log('マス目クリック:', { row, col, piece, selectedSquare });
    
    if (selectedSquare) {
        // 駒を動かす
        console.log('駒を移動:', selectedSquare, '→', { row, col });
        ws.send(JSON.stringify({
            type: 'move',
            from: selectedSquare,
            to: { row, col }
        }));
        
        clearSelection();
    } else if (piece && piece.color === myColor) {
        // 駒を選択
        console.log('駒を選択:', { row, col, piece });
        selectedSquare = { row, col };
        highlightSquare(row, col);
    }
}

function highlightSquare(row, col) {
    clearSelection();
    const squares = document.querySelectorAll('.square');
    const index = row * 8 + col;
    squares[index].classList.add('selected');
    selectedSquare = { row, col };
}

function clearSelection() {
    selectedSquare = null;
    document.querySelectorAll('.square').forEach(square => {
        square.classList.remove('selected', 'valid-move');
    });
}

function updateTurnDisplay() {
    const turnSpan = document.getElementById('current-turn');
    turnSpan.textContent = currentTurn === 'white' ? '⚪ 白' : '⚫ 黒';
    turnSpan.style.color = currentTurn === myColor ? '#00ff00' : '#ffff00';
}

function updateCapturedPieces(captured) {
    if (!captured) return;
    
    const whiteCaptured = document.getElementById('white-captured');
    const blackCaptured = document.getElementById('black-captured');
    
    whiteCaptured.innerHTML = '';
    blackCaptured.innerHTML = '';
    
    captured.white.forEach(piece => {
        const span = document.createElement('span');
        span.className = 'captured-piece';
        span.textContent = pieceSymbols.white[piece];
        whiteCaptured.appendChild(span);
    });
    
    captured.black.forEach(piece => {
        const span = document.createElement('span');
        span.className = 'captured-piece';
        span.textContent = pieceSymbols.black[piece];
        blackCaptured.appendChild(span);
    });
}

function showWaitingMessage(playerCount) {
    console.log('待機メッセージ表示');
    document.getElementById('waiting-message').style.display = 'block';
    document.getElementById('player-count').textContent = playerCount;
    document.getElementById('game-container').style.display = 'none';
}

function hideWaitingMessage() {
    console.log('待機メッセージ非表示');
    document.getElementById('waiting-message').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
}

function showGameResult(winner, reason) {
    const resultDiv = document.getElementById('game-result');
    const resultText = document.getElementById('result-text');
    
    if (winner === 'draw') {
        resultText.textContent = '引き分け！';
    } else if (winner === myColor) {
        resultText.textContent = '🎉 勝利！ 🎉';
    } else {
        resultText.textContent = '敗北...';
    }
    
    resultDiv.style.display = 'block';
}

document.getElementById('rematch-btn').addEventListener('click', () => {
    location.reload();
});

function updateConnectionStatus(status) {
    const indicator = document.getElementById('connection-status');
    indicator.className = `connection-status ${status}`;
    switch(status) {
        case 'connected':
            indicator.textContent = '🟢 接続済み';
            break;
        case 'disconnected':
            indicator.textContent = '🔴 切断';
            break;
        case 'connecting':
            indicator.textContent = '🟡 接続中...';
            break;
    }
}

function hideLoadingScreen() {
    console.log('ローディング画面を非表示');
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.add('hidden');
    setTimeout(() => loadingScreen.style.display = 'none', 500);
}

function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = type === 'error' 
        ? document.getElementById('error-message') 
        : document.getElementById('success-message');
    
    if (messageElement) {
        messageElement.textContent = text;
        messageElement.style.display = 'block';
        setTimeout(() => messageElement.style.display = 'none', duration);
    }
}

// ページ読み込み時の初期化
window.addEventListener('load', () => {
    console.log('ページ読み込み完了');
});