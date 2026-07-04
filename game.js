import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, push } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// =========================================================
// WAŻNE: TUTAJ WKLEJ SWOJĄ KONFIGURACJĘ Z KONSOLI FIREBASE
// =========================================================
const firebaseConfig = {
  apiKey: "TWOJ_KLUCZ_API",
  authDomain: "twoj-projekt.firebaseapp.com",
  databaseURL: "https://twoj-projekt.firebasedatabase.app",
  projectId: "twoj-projekt",
  storageBucket: "twoj-projekt.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456",
  measurementId: "G-ABCDEF12"
};
// =========================================================

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// --- ZMIENNE GLOBALNE ---
let currentUser = null;
let currentRoomId = null;
let currentRoomData = null; 
let selectedAvatar = '👨‍🚀';

let dbQuestions = [];
let myLocalProgress = 0;
let myLocalScore = 0;
let roomQuestions = [];

// --- NARZĘDZIA ---
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.remove('hidden');
    document.getElementById(screenId).classList.add('active');
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function generateDynamicHint(answerText) {
    let cleanAnswer = answerText.split('(')[0].trim();
    let firstLetter = cleanAnswer.charAt(0).toUpperCase();
    let length = cleanAnswer.replace(/\s/g, '').length;
    return `Pierwsza litera to <strong>${firstLetter}</strong>. Zawiera <strong>${length}</strong> znaków.`;
}

async function fetchQuestions() {
    if(dbQuestions.length > 0) return;
    try {
        const response = await fetch('questions.json');
        dbQuestions = await response.json();
    } catch (error) {
        console.error("Błąd bazy pytań:", error);
        dbQuestions = [{ question: "Błąd ładowania bazy.", answer: "Brak", hint: "Brak", category: "System" }];
    }
}

// --- UI LOGOWANIA / REJESTRACJI ---
document.querySelectorAll('.avatar-option').forEach(el => {
    el.addEventListener('click', (e) => {
        document.querySelectorAll('.avatar-option').forEach(a => a.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedAvatar = e.target.getAttribute('data-avatar');
    });
});

document.getElementById('link-register').addEventListener('click', () => {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
});

document.getElementById('btn-cancel-register').addEventListener('click', () => {
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
});

document.getElementById('btn-register').addEventListener('click', async () => {
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const username = document.getElementById('reg-username').value.trim();
    const tagline = document.getElementById('reg-tagline').value.trim();

    if(!email || !pass || !username) { alert("Wypełnij wymagane pola!"); return; }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        await set(ref(db, 'users/' + user.uid), {
            username: username,
            avatar: selectedAvatar,
            tagline: tagline,
            currency: 0
        });

        alert("Konto założone! Możesz się teraz zalogować.");
        document.getElementById('btn-cancel-register').click(); 
    } catch (error) {
        console.error("Błąd rejestracji:", error);
        alert("Błąd: " + error.message);
    }
});

document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;

    if(!email || !pass) { alert("Wpisz email i hasło!"); return; }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        const snapshot = await get(ref(db, 'users/' + user.uid));
        
        if(snapshot.exists()) {
            currentUser = { uid: user.uid, ...snapshot.val() };
            updateNavbar();
            switchScreen('screen-dashboard');
            listenToAllRooms();
        } else {
            alert("Błąd pobierania profilu użytkownika.");
        }
    } catch (error) {
        console.error("Błąd logowania:", error);
        alert("Błędny email lub hasło!");
    }
});

function updateNavbar() {
    document.getElementById('navbar').classList.remove('hidden');
    document.getElementById('nav-avatar').innerText = currentUser.avatar;
    document.getElementById('nav-username').innerText = currentUser.username;
    document.getElementById('nav-currency').innerText = `💰 ${currentUser.currency || 0} G-Coins`;
}

document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
        await signOut(auth);
        currentUser = null;
        document.getElementById('navbar').classList.add('hidden');
        switchScreen('screen-auth');
    } catch (error) {
        console.error("Błąd wylogowywania:", error);
    }
});

// --- DASHBOARD POKOI ---
function listenToAllRooms() {
    onValue(ref(db, 'rooms'), (snapshot) => {
        const roomList = document.getElementById('room-list');
        roomList.innerHTML = '';
        
        if (!snapshot.exists()) {
            roomList.innerHTML = '<p style="text-align:center; color:#94a3b8;">Brak aktywnych pokoi. Stwórz pierwszy!</p>';
            return;
        }

        const rooms = snapshot.val();
        for (const roomId in rooms) {
            const room = rooms[roomId];
            
            if (!room || !room.hostName || !room.category) continue;
            
            const playersCount = room.players ? Object.keys(room.players).length : 0;
            const isFull = playersCount >= room.maxPlayers;
            
            const roomDiv = document.createElement('div');
            roomDiv.className = 'room-item';
            
            roomDiv.innerHTML = `
                <div class="room-info">
                    <span class="room-title">Pokój: ${room.hostName} ${room.isPrivate ? '<span class="badge-private">🔒 HASŁO</span>' : ''}</span>
                    <span class="room-meta">Kategoria: ${room.category} | Pytań: ${room.questionCount} | Czas: ${room.timeLimit}h</span>
                </div>
                <div class="room-status ${isFull ? 'status-full' : 'status-open'}">
                    ${playersCount}/${room.maxPlayers} ${isFull ? '(Pełny)' : ''}
                </div>
            `;

            roomDiv.addEventListener('click', () => joinRoom(roomId, room, isFull));
            roomList.appendChild(roomDiv);
        }
    });
}

document.getElementById('btn-show-create-room').addEventListener('click', () => { switchScreen('screen-create-room'); });
document.getElementById('btn-back-dashboard').addEventListener('click', () => { switchScreen('screen-dashboard'); });

document.getElementById('room-privacy').addEventListener('change', (e) => {
    if(e.target.value === 'private') document.getElementById('room-password-container').classList.remove('hidden');
    else document.getElementById('room-password-container').classList.add('hidden');
});

// --- TWORZENIE POKOJU ---
document.getElementById('btn-create-room-confirm').addEventListener('click', async () => {
    await fetchQuestions(); 

    const category = document.getElementById('room-category').value;
    const qCount = parseInt(document.getElementById('room-q-count').value);
    const maxPlayers = parseInt(document.getElementById('room-max-players').value);
    const timeLimit = parseInt(document.getElementById('room-time-limit').value);
    const isPrivate = document.getElementById('room-privacy').value === 'private';
    const password = document.getElementById('room-password').value;

    if (isPrivate && !password) { alert("Wpisz hasło dla prywatnego pokoju!"); return; }

    let pool = [...dbQuestions];
    if (category !== "Wszystkie") {
        pool = pool.filter(q => q.category === category);
    }
    shuffleArray(pool);
    const selectedQuestions = pool.slice(0, Math.min(qCount, pool.length));

    const newRoomRef = push(ref(db, 'rooms')); 
    currentRoomId = newRoomRef.key;

    const roomData = {
        hostId: currentUser.uid,
        hostName: currentUser.username,
        status: 'open',
        category: category,
        questionCount: selectedQuestions.length,
        questions: selectedQuestions,
        maxPlayers: maxPlayers,
        timeLimit: timeLimit,
        isPrivate: isPrivate,
        password: isPrivate ? password : "",
        createdAt: Date.now(),
        players: {}
    };

    roomData.players[currentUser.uid] = {
        username: currentUser.username,
        avatar: currentUser.avatar,
        progress: 0,
        score: 0,
        status: 'waiting'
    };

    await set(newRoomRef, roomData);
    
    document.getElementById('room-view-title').innerText = `Pokój: ${currentRoomId.slice(-5)} ${isPrivate ? '🔒' : '🌍'}`;
    switchScreen('screen-room');
    listenToCurrentRoom();
});

// --- DOŁĄCZANIE DO POKOJU ---
async function joinRoom(roomId, roomData, isFull) {
    const isAlreadyInRoom = roomData.players && roomData.players[currentUser.uid];

    if (isFull && !isAlreadyInRoom) {
        alert("Ten pokój jest już pełny!");
        return;
    }

    if (roomData.isPrivate && !isAlreadyInRoom) {
        const userPass = prompt("Pokój jest prywatny. Podaj hasło:");
        if (userPass !== roomData.password) {
            alert("Nieprawidłowe hasło!");
            return;
        }
    }

    currentRoomId = roomId;

    if (!isAlreadyInRoom) {
        await update(ref(db, `rooms/${roomId}/players/${currentUser.uid}`), {
            username: currentUser.username,
            avatar: currentUser.avatar,
            progress: 0,
            score: 0,
            status: 'waiting'
        });
    }

    document.getElementById('room-view-title').innerText = `Pokój: ${roomId.slice(-5)} ${roomData.isPrivate ? '🔒' : '🌍'}`;
    switchScreen('screen-room');
    listenToCurrentRoom();
}

// --- POCZEKALNIA I SYNCHRONIZACJA WYNIKÓW ---
function listenToCurrentRoom() {
    onValue(ref(db, `rooms/${currentRoomId}`), (snapshot) => {
        if(!snapshot.exists()) return;
        currentRoomData = snapshot.val();
        
        const list = document.getElementById('room-players-list');
        if(list) list.innerHTML = '';
        
        for (const playerId in currentRoomData.players) {
            const player = currentRoomData.players[playerId];
            const isMe = playerId === currentUser.uid;
            if(list) {
                list.innerHTML += `
                    <div class="player-row">
                        <span class="user-profile"><span style="font-size:20px;">${player.avatar}</span> ${player.username} ${isMe ? '(Ty)' : ''}</span>
                        <span style="color: ${player.status === 'completed' ? 'var(--success)' : 'var(--warning)'};">
                            ${player.status === 'completed' ? 'Ukończono' : `Pytań: ${player.progress}/${currentRoomData.questionCount}`}
                        </span>
                    </div>
                `;
            }
        }

        const amICompleted = currentRoomData.players[currentUser.uid]?.status === 'completed';
        
        if (amICompleted) {
            const playersArray = Object.values(currentRoomData.players);
            const allFinished = playersArray.every(p => p.status === 'completed');
            
            if (allFinished) {
                document.getElementById('waiting-message').classList.add('hidden');
                document.getElementById('podium-container').classList.remove('hidden');
                renderRealLeaderboard(playersArray);
            } else {
                document.getElementById('waiting-message').classList.remove('hidden');
                document.getElementById('podium-container').classList.add('hidden');
                renderWaitingLeaderboard(playersArray, currentRoomData.questionCount);
            }
        }
    });
}

function renderWaitingLeaderboard(playersArray, totalQuestions) {
    const list = document.getElementById('final-leaderboard');
    list.innerHTML = '';
    
    playersArray.sort((a, b) => b.progress - a.progress);
    
    playersArray.forEach((p) => {
        const isDone = p.status === 'completed';
        list.innerHTML += `
            <div class="player-row" style="${p.username === currentUser.username ? 'background: rgba(255,255,255,0.05); border-radius: 8px;' : ''}">
                <span>${p.avatar} ${p.username}</span>
                <span style="color: ${isDone ? 'var(--success)' : 'var(--warning)'}; font-weight:bold;">
                    ${isDone ? 'Ukończono' : `${p.progress}/${totalQuestions}`}
                </span>
            </div>
        `;
    });
}

function renderRealLeaderboard(playersArray) {
    playersArray.sort((a, b) => b.score - a.score);

    const p1 = playersArray[0];
    const p2 = playersArray[1];
    const p3 = playersArray[2];

    if (p1) {
        document.getElementById('podium-1-name').innerText = p1.username;
        document.getElementById('podium-1-score').innerText = p1.score + " pkt";
        document.getElementById('podium-1-avatar').innerText = p1.avatar;
        document.getElementById('podium-1-wrapper').classList.remove('hidden');
    } else document.getElementById('podium-1-wrapper').classList.add('hidden');

    if (p2) {
        document.getElementById('podium-2-name').innerText = p2.username;
        document.getElementById('podium-2-score').innerText = p2.score + " pkt";
        document.getElementById('podium-2-avatar').innerText = p2.avatar;
        document.getElementById('podium-2-wrapper').classList.remove('hidden');
    } else document.getElementById('podium-2-wrapper').classList.add('hidden');

    if (p3) {
        document.getElementById('podium-3-name').innerText = p3.username;
        document.getElementById('podium-3-score').innerText = p3.score + " pkt";
        document.getElementById('podium-3-avatar').innerText = p3.avatar;
        document.getElementById('podium-3-wrapper').classList.remove('hidden');
    } else document.getElementById('podium-3-wrapper').classList.add('hidden');

    const list = document.getElementById('final-leaderboard');
    list.innerHTML = '';
    playersArray.forEach((p, index) => {
        list.innerHTML += `
            <div class="player-row" style="${p.username === currentUser.username ? 'background: rgba(255,255,255,0.05); border-radius: 8px;' : ''}">
                <span>${index + 1}. ${p.avatar} ${p.username}</span>
                <span class="player-completed">${p.score} pkt</span>
            </div>
        `;
    });
}

document.getElementById('btn-leave-room').addEventListener('click', () => {
    currentRoomId = null;
    switchScreen('screen-dashboard');
});

document.getElementById('btn-return-to-dash').addEventListener('click', () => {
    currentRoomId = null;
    switchScreen('screen-dashboard');
});

// --- GRA: ROZWIĄZYWANIE WŁASNEGO QUIZU ---
document.getElementById('btn-start-my-quiz').addEventListener('click', async () => {
    if (!currentRoomData || !currentRoomData.questions) {
        alert("Błąd ładowania pytań z pokoju!");
        return;
    }

    if (currentRoomData.players[currentUser.uid].status === 'completed') {
        switchScreen('screen-results');
        return;
    }

    myLocalProgress = currentRoomData.players[currentUser.uid].progress || 0;
    myLocalScore = currentRoomData.players[currentUser.uid].score || 0;
    roomQuestions = currentRoomData.questions; 
    
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { status: 'in_progress' });
    
    switchScreen('screen-quiz');
    loadNextAsyncQuestion();
});

function loadNextAsyncQuestion() {
    if (myLocalProgress >= roomQuestions.length) {
        finishMyQuiz();
        return;
    }
    
    const qTotal = roomQuestions.length;
    const currentQ = roomQuestions[myLocalProgress];

    document.getElementById('quiz-progress-text').innerText = `Pytanie ${myLocalProgress + 1} / ${qTotal}`;
    document.getElementById('quiz-progress-bar').style.width = `${((myLocalProgress) / qTotal) * 100}%`;
    
    document.getElementById('quiz-category').innerText = currentQ.category || "Ogólne";
    document.getElementById('quiz-question-text').innerText = currentQ.question;
    document.getElementById('quiz-real-answer').innerText = currentQ.answer;
    
    document.getElementById('quiz-hint-text').innerHTML = currentQ.hint || generateDynamicHint(currentQ.answer);

    document.getElementById('quiz-hint-text').classList.add('hidden');
    document.getElementById('btn-quiz-show-hint').classList.remove('hidden');
    document.getElementById('quiz-answer-eval').classList.add('hidden');
    document.getElementById('btn-quiz-check').classList.remove('hidden');
}

document.getElementById('btn-quiz-show-hint').addEventListener('click', () => {
    document.getElementById('btn-quiz-show-hint').classList.add('hidden');
    document.getElementById('quiz-hint-text').classList.remove('hidden');
});

document.getElementById('btn-quiz-check').addEventListener('click', () => {
    document.getElementById('btn-quiz-check').classList.add('hidden');
    document.getElementById('quiz-answer-eval').classList.remove('hidden');
});

async function handleAnswer(isCorrect) {
    if (isCorrect) myLocalScore++;
    myLocalProgress++;
    
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { 
        progress: myLocalProgress, 
        score: myLocalScore 
    });

    loadNextAsyncQuestion();
}

document.getElementById('btn-quiz-correct').addEventListener('click', () => handleAnswer(true));
document.getElementById('btn-quiz-wrong').addEventListener('click', () => handleAnswer(false));

async function finishMyQuiz() {
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { 
        status: 'completed',
        progress: roomQuestions.length 
    });
    
    switchScreen('screen-results');
}
