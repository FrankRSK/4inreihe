document.addEventListener('DOMContentLoaded', () => {
    // Spiel-Elemente
    const boardElement = document.getElementById('game-board');
    const statusText = document.getElementById('status-text');
    const resetButton = document.getElementById('reset-button');
    const difficultySelect = document.getElementById('difficulty-select');
    
    // Regel-Modal Elemente
    const rulesButton = document.getElementById('rules-button');
    const rulesModal = document.getElementById('rules-modal');
    const closeButton = document.querySelector('.close-button');

    // Audio-Elemente (Fehler abfangen falls Dateien fehlen)
    const getAudio = (id) => document.getElementById(id);
    const dropSound = getAudio('drop-sound');
    const winSound = getAudio('win-sound');
    const loseSound = getAudio('lose-sound');
    const drawSound = getAudio('draw-sound');
    
    // Lautstärke anpassen
    [dropSound, winSound, loseSound, drawSound].forEach(s => { if(s) s.volume = 0.3; });

    const ROWS = 6, COLS = 7;
    const PLAYER_HUMAN = 1, PLAYER_AI = 2;
    const EMPTY = 0;
    
    let board = [];
    let currentPlayer = PLAYER_HUMAN;
    let gameOver = false;
    let isDropping = false; // Verhindert Klicks während der Animation
    let aiDepth = parseInt(difficultySelect.value, 10);

    // Event-Listeners
    resetButton.addEventListener('click', createBoard);
    difficultySelect.addEventListener('change', (e) => {
        aiDepth = parseInt(e.target.value, 10);
    });
    
    rulesButton.addEventListener('click', (e) => { 
        e.stopPropagation();
        rulesModal.style.display = 'block'; 
    });
    
    closeButton.addEventListener('click', () => { rulesModal.style.display = 'none'; });
    
    window.addEventListener('click', (event) => {
        if (event.target == rulesModal) {
            rulesModal.style.display = 'none';
        }
    });

    function createBoard() {
        boardElement.innerHTML = '';
        const pieceContainer = document.createElement('div');
        pieceContainer.className = 'piece-container';
        boardElement.classList.remove('player-win', 'player-lose');
        
        aiDepth = parseInt(difficultySelect.value, 10);
        board = Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY));
        gameOver = false;
        isDropping = false;
        currentPlayer = PLAYER_HUMAN;
        statusText.textContent = "Du bist am Zug.";

        for (let c = 0; c < COLS; c++) {
            const column = document.createElement('div');
            column.classList.add('column');
            column.dataset.col = c;
            column.addEventListener('click', handleColumnClick);
            for (let r = 0; r < ROWS; r++) {
                const slot = document.createElement('div');
                slot.classList.add('slot');
                column.appendChild(slot);
            }
            pieceContainer.appendChild(column);
        }
        boardElement.appendChild(pieceContainer);
        createSVGOverlay();
    }
    
    function createSVGOverlay() {
        // Diese Konstanten müssen mit CSS übereinstimmen für die viewBox
        const PADDING = 10;
        const SLOT_WIDTH = 70, SLOT_HEIGHT = 70;
        const MARGIN_H = 5, MARGIN_V = 5;
        
        const TILE_WIDTH = SLOT_WIDTH + (2 * MARGIN_H);
        const TILE_HEIGHT = SLOT_HEIGHT + (2 * MARGIN_V);
        
        const totalWidth = (COLS * TILE_WIDTH) + (2 * PADDING);
        const totalHeight = (ROWS * TILE_HEIGHT) + (2 * PADDING);
        
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        
        svg.id = 'board-overlay-svg';
        // WICHTIG: Keine feste Width/Height in Pixeln, damit CSS skalieren kann
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        // ViewBox definiert das interne Koordinatensystem
        svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
        svg.setAttribute('preserveAspectRatio', 'none'); // Dehnt sich exakt auf den Container

        const defs = document.createElementNS(svgNS, 'defs');
        const mask = document.createElementNS(svgNS, 'mask');
        mask.id = 'hole-mask';
        
        const maskRect = document.createElementNS(svgNS, 'rect');
        maskRect.setAttribute('width', '100%');
        maskRect.setAttribute('height', '100%');
        maskRect.setAttribute('fill', 'white');
        mask.appendChild(maskRect);
        
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const circle = document.createElementNS(svgNS, 'circle');
                // Berechnung der Lochmitten
                const cx = PADDING + MARGIN_H + (c * TILE_WIDTH) + (SLOT_WIDTH / 2);
                // Reihenfolge umdrehen für SVG Koordinaten (oben ist 0) vs Spiel-Logik (unten ist 0)
                // Spiel-Array: Index 0 ist UNTEN. SVG: y=0 ist OBEN.
                // Das HTML Grid ist "column-reverse", also ist das erste child unten.
                // Das SVG muss dazu passen. Da HTML flex-direction reverse hat, ist visuell oben auch oben.
                // Wir zeichnen einfach ein Gitter. Die Löcher passen, da HTML Slots feste Größe haben.
                const cy = PADDING + MARGIN_V + ((ROWS - 1 - r) * TILE_HEIGHT) + (SLOT_HEIGHT / 2);

                circle.setAttribute('cx', cx);
                circle.setAttribute('cy', cy);
                circle.setAttribute('r', SLOT_WIDTH / 2 - 1); // -1px für saubereren Rand
                circle.setAttribute('fill', 'black');
                mask.appendChild(circle);
            }
        }
        defs.appendChild(mask);
        svg.appendChild(defs);
        
        const visibleRect = document.createElementNS(svgNS, 'rect');
        visibleRect.setAttribute('width', '100%');
        visibleRect.setAttribute('height', '100%');
        visibleRect.setAttribute('fill', '#2c3e50'); // Hardcoded Farbe aus CSS Var --board-bg
        visibleRect.setAttribute('mask', 'url(#hole-mask)');
        svg.appendChild(visibleRect);
        
        boardElement.appendChild(svg);
    }

    function handleColumnClick(e) {
        if (gameOver || currentPlayer !== PLAYER_HUMAN || isDropping) return;
        const col = parseInt(e.currentTarget.dataset.col);
        makeMove(col, PLAYER_HUMAN);
    }

    function makeMove(col, player) {
        const row = getNextAvailableRow(col);
        if (row === null) return;

        isDropping = true; // Eingabe sperren während Animation
        board[row][col] = player;
        
        // Stein droppen lassen
        dropPiece(row, col, player);

        // Verzögerung für die Logik, damit Animation wirken kann
        setTimeout(() => {
            const winInfo = checkWin(player);
            if (winInfo) {
                const message = player === PLAYER_HUMAN ? "Du hast gewonnen!" : "Die KI hat gewonnen!";
                endGame(message);
                highlightWinningPieces(winInfo);
                isDropping = false;
                return;
            }
            
            if (isUnwinnable()) {
                endGame("Unentschieden! Kein Gewinn mehr möglich.");
                isDropping = false;
                return;
            }
            
            switchPlayer();
            isDropping = false;
        }, 550); // Etwas länger als die CSS Animation
    }

    function dropPiece(row, col, player) {
        const piece = document.createElement('div');
        piece.classList.add('piece', `player${player}`);
        const pieceContainer = boardElement.querySelector('.piece-container');
        const columnElement = pieceContainer.querySelector(`.column[data-col='${col}']`);
        
        if (columnElement && columnElement.children[row]) { // Check row existence
             // Wegen flex-direction: column-reverse ist index 0 unten. Das passt.
            columnElement.children[row].appendChild(piece);
            // Sound leicht verzögert für Aufprall-Effekt
            setTimeout(() => { if(dropSound) dropSound.play().catch(e => {}); }, 400);
        }
    }
    
    function getNextAvailableRow(col) { 
        for(let r=0; r<ROWS; r++) {
            if(board[r][col]===EMPTY) return r; 
        }
        return null; 
    }
    
    function switchPlayer() {
        currentPlayer = (currentPlayer === PLAYER_AI) ? PLAYER_HUMAN : PLAYER_AI;
        statusText.textContent = (currentPlayer === PLAYER_HUMAN) ? "Du bist am Zug." : "Die KI denkt nach...";
        
        if (currentPlayer === PLAYER_AI) {
            // KI Zug verzögern für besseres Spielgefühl
            setTimeout(aiMove, 600);
        }
    }
    
    function endGame(message) {
        gameOver = true;
        statusText.textContent = message;

        if (message.includes("Du hast gewonnen")) {
            if(winSound) winSound.play().catch(e => {});
        } else if (message.includes("KI hat gewonnen")) {
            if(loseSound) loseSound.play().catch(e => {});
        } else {
            if(drawSound) drawSound.play().catch(e => {});
        }
    }
    
    // Einfacher Minimax Algorithmus (unverändert gelassen, da funktional ok)
    function aiMove() {
        // Sicherheitshalber checken ob Spiel vorbei
        if(gameOver) return;
        
        // Bei Tiefe 8 auf Mobile kann es laggen, Tiefe 5 ist guter Kompromiss
        let safeDepth = aiDepth; 
        
        const{col} = minimax(board, safeDepth, -Infinity, Infinity, true);
        
        // Fallback falls col null ist (z.B. Board voll oder Fehler)
        if (col !== null && col !== undefined) {
             makeMove(col, PLAYER_AI);
        } else {
             // Notfallzug: Nimm erste freie Spalte
             const validCols = getValidColumns(board);
             if(validCols.length > 0) makeMove(validCols[0], PLAYER_AI);
        }
    }

    // --- Vorhandene Logik-Funktionen (Minimax, CheckWin) minimal bereinigt ---

    function checkWin(player) {
        // Horizontal
        for(let r=0;r<ROWS;r++)for(let c=0;c<COLS-3;c++)
            if(board[r][c]===player&&board[r][c+1]===player&&board[r][c+2]===player&&board[r][c+3]===player)return{r,c,dir:'h'}; 
        // Vertikal
        for(let c=0;c<COLS;c++)for(let r=0;r<ROWS-3;r++)
            if(board[r][c]===player&&board[r+1][c]===player&&board[r+2][c]===player&&board[r+3][c]===player)return{r,c,dir:'v'}; 
        // Diagonal Positiv
        for(let r=0;r<ROWS-3;r++)for(let c=0;c<COLS-3;c++)
            if(board[r][c]===player&&board[r+1][c+1]===player&&board[r+2][c+2]===player&&board[r+3][c+3]===player)return{r,c,dir:'d_pos'}; 
        // Diagonal Negativ
        for(let r=3;r<ROWS;r++)for(let c=0;c<COLS-3;c++)
            if(board[r][c]===player&&board[r-1][c+1]===player&&board[r-2][c+2]===player&&board[r-3][c+3]===player)return{r,c,dir:'d_neg'}; 
        return null;
    }

    function isUnwinnable() {
        const allPossibleWins = [];
        // Gleiche Logik wie vorher, nur sauberer formatiert
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 3; c++) allPossibleWins.push([board[r][c], board[r][c+1], board[r][c+2], board[r][c+3]]);
        for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS - 3; r++) allPossibleWins.push([board[r][c], board[r+1][c], board[r+2][c], board[r+3][c]]);
        for (let r = 0; r < ROWS - 3; r++) for (let c = 0; c < COLS - 3; c++) allPossibleWins.push([board[r][c], board[r+1][c+1], board[r+2][c+2], board[r+3][c+3]]);
        for (let r = 3; r < ROWS; r++) for (let c = 0; c < COLS - 3; c++) allPossibleWins.push([board[r][c], board[r-1][c+1], board[r-2][c+2], board[r-3][c+3]]);

        for (const window of allPossibleWins) {
            const hasPlayer1 = window.includes(PLAYER_HUMAN);
            const hasPlayer2 = window.includes(PLAYER_AI);
            // Wenn in einem Fenster NICHT beide Spieler drin sind, ist es noch gewinnbar
            if (!hasPlayer1 || !hasPlayer2) return false;
        }
        return true;
    }

    function highlightWinningPieces(winInfo) {
        if(!winInfo)return; 
        const pieceContainer=boardElement.querySelector('.piece-container'); 
        for(let i=0;i<4;i++){
            let r=winInfo.r,c=winInfo.c; 
            if(winInfo.dir==='h')c+=i; 
            else if(winInfo.dir==='v')r+=i; 
            else if(winInfo.dir==='d_pos'){r+=i;c+=i;} 
            else if(winInfo.dir==='d_neg'){r-=i;c+=i;} 
            
            const columnElement=pieceContainer.querySelector(`.column[data-col='${c}']`); 
            if(columnElement&&columnElement.children[r]){
                const piece=columnElement.children[r].querySelector('.piece'); 
                if(piece) piece.classList.add('winning');
            }
        }
    }

    // Minimax & Helper (Score Position, Evaluate)
    function scorePosition(b, p) {
        let score = 0;
        const centerCol = b.map(row => row[Math.floor(COLS / 2)]);
        const centerCount = centerCol.filter(x => x === p).length;
        score += centerCount * 3;
        
        // Horizontal, Vertikal, Diagonal Fenster bewerten
        // (Code ist identisch zur Vorlage, nur komprimiert)
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 3; c++) score += evaluateWindow(b[r].slice(c, c + 4), p);
        for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS - 3; r++) score += evaluateWindow([b[r][c], b[r+1][c], b[r+2][c], b[r+3][c]], p);
        for (let r = 0; r < ROWS - 3; r++) for (let c = 0; c < COLS - 3; c++) score += evaluateWindow([b[r][c], b[r+1][c+1], b[r+2][c+2], b[r+3][c+3]], p);
        for (let r = 3; r < ROWS; r++) for (let c = 0; c < COLS - 3; c++) score += evaluateWindow([b[r][c], b[r-1][c+1], b[r-2][c+2], b[r-3][c+3]], p);
        return score;
    }

    function evaluateWindow(window, player) {
        let score = 0;
        const opponent = player === PLAYER_AI ? PLAYER_HUMAN : PLAYER_AI;
        const playerCount = window.filter(p => p === player).length;
        const opponentCount = window.filter(p => p === opponent).length;
        const emptyCount = window.filter(p => p === EMPTY).length;

        if (playerCount === 4) score += 1000;
        else if (playerCount === 3 && emptyCount === 1) score += 10;
        else if (playerCount === 2 && emptyCount === 2) score += 5;
        if (opponentCount === 3 && emptyCount === 1) score -= 80;
        return score;
    }

    function minimax(currBoard, depth, alpha, beta, maximizingPlayer){
        const validCols = getValidColumns(currBoard);
        const isWinAI = checkWinForBoard(currBoard, PLAYER_AI);
        const isWinHuman = checkWinForBoard(currBoard, PLAYER_HUMAN);
        const isTerminal = isWinAI || isWinHuman || validCols.length === 0;

        if (depth === 0 || isTerminal) {
            if (isTerminal) {
                if (isWinAI) return { score: 1000000 + depth, col: null };
                if (isWinHuman) return { score: -1000000 - depth, col: null };
                return { score: 0, col: null };
            } else { 
                return { score: scorePosition(currBoard, PLAYER_AI), col: null };
            }
        }
        
        if(maximizingPlayer){
            let maxScore = -Infinity; 
            // Zufällige Spalte als Startwert, falls alle gleich gut sind
            let bestCol = validCols[Math.floor(Math.random()*validCols.length)];
            
            for(let col of validCols){
                let tempBoard = copyBoard(currBoard); 
                let row = getNextAvailableRowForBoard(tempBoard,col); 
                tempBoard[row][col] = PLAYER_AI; 
                let score = minimax(tempBoard, depth-1, alpha, beta, false).score; 
                if(score > maxScore){ maxScore = score; bestCol = col; }
                alpha = Math.max(alpha, score); 
                if(alpha >= beta) break;
            }
            return { score: maxScore, col: bestCol };
        } else {
            let minScore = Infinity; 
            let bestCol = validCols[Math.floor(Math.random()*validCols.length)]; 
            
            for(let col of validCols){
                let tempBoard = copyBoard(currBoard); 
                let row = getNextAvailableRowForBoard(tempBoard,col); 
                tempBoard[row][col] = PLAYER_HUMAN; 
                let score = minimax(tempBoard, depth-1, alpha, beta, true).score; 
                if(score < minScore){ minScore = score; bestCol = col; }
                beta = Math.min(beta, score); 
                if(alpha >= beta) break;
            }
            return { score: minScore, col: bestCol };
        }
    }

    function checkWinForBoard(b, p){
        // Kompakte Prüfung für Minimax Simulation
        for(let r=0;r<ROWS;r++)for(let c=0;c<COLS-3;c++) if(b[r][c]===p&&b[r][c+1]===p&&b[r][c+2]===p&&b[r][c+3]===p)return true;
        for(let c=0;c<COLS;c++)for(let r=0;r<ROWS-3;r++) if(b[r][c]===p&&b[r+1][c]===p&&b[r+2][c]===p&&b[r+3][c]===p)return true;
        for(let r=0;r<ROWS-3;r++)for(let c=0;c<COLS-3;c++) if(b[r][c]===p&&b[r+1][c+1]===p&&b[r+2][c+2]===p&&b[r+3][c+3]===p)return true;
        for(let r=3;r<ROWS;r++)for(let c=0;c<COLS-3;c++) if(b[r][c]===p&&b[r-1][c+1]===p&&b[r-2][c+2]===p&&b[r-3][c+3]===p)return true;
        return false;
    }
    
    function getValidColumns(b){
        const validCols=[]; 
        for(let c=0; c<COLS; c++) if(b[ROWS-1][c]===EMPTY) validCols.push(c); 
        return validCols;
    }
    
    function copyBoard(b){ return b.map(arr => arr.slice()); }
    
    function getNextAvailableRowForBoard(b,col){
        for(let r=0;r<ROWS;r++) if(b[r][col]===EMPTY) return r; 
        return null;
    }

    // Start
    createBoard();
});
