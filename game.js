import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, push, remove, off } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBeSs0i1oKNUeEbCCi8mWEs6WfxukWAebA",
  authDomain: "quisent-8b6cd.firebaseapp.com",
  databaseURL: "https://quisent-8b6cd-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quisent-8b6cd",
  storageBucket: "quisent-8b6cd.firebasedatabase.app",
  messagingSenderId: "537252295249",
  appId: "1:537252295249:web:7174d90b51d794ef973e70",
  measurementId: "G-KL93NQKPZ3"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUser = null, currentRoomId = null, currentRoomData = null;
let selectedAvatar = '👨‍🚀', dbQuestions = [], myLocalProgress = 0, myLocalScore = 0, roomQuestions = [];

window.switchScreen = (screenId) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.remove('hidden');
    document.getElementById(screenId).classList.add('active');
};

// --- ŁADOWANIE PYTAŃ Z BLOKADĄ ---
async function fetchQuestions() {
    if(dbQuestions.length > 0) return true;
    try {
        const response = await fetch('questions.json');
        if(!response.ok) throw new Error("Nie znaleziono questions.json");
        dbQuestions = await response.json();
        return true;
    } catch (e) { 
        console.error("Błąd pytań:", e); 
        alert("Błąd: Nie można załadować questions.json. Sprawdź czy plik jest w folderze!");
        return false;
    }
}

// --- LOGOWANIE I REJESTRACJA ---
document.getElementById('btn-login').addEventListener('click', async () => {
    try {
        const cred = await signInWithEmailAndPassword(auth, document.getElementById('auth-email').value, document.getElementById('auth-pass').value);
        const snap = await get(ref(db, 'users/' + cred.user.uid));
        currentUser = { uid: cred.user.uid, ...snap.val() };
        document.getElementById('nav-username').innerText = currentUser.username;
        document.getElementById('nav-avatar').innerText = currentUser.avatar;
        document.getElementById('navbar').classList.remove('hidden');
        switchScreen('screen-dashboard');
        listenToAllRooms();
    } catch (e) { alert("Błąd logowania: " + e.message); }
});

// --- POKOJE ---
function listenToAllRooms() {
    onValue(ref(db, 'rooms'), (snapshot) => {
        const roomList = document.getElementById('room-list');
        roomList.innerHTML = '';
        const rooms = snapshot.val() || {};
        for (const roomId in rooms) {
            if (rooms[roomId].status !== 'finished') {
                const div = document.createElement('div');
                div.className = 'room-item';
                div.innerHTML = `<div><strong>${rooms[roomId].hostName}</strong></div><div>${rooms[roomId].category}</div>`;
                div.onclick = () => joinRoom(roomId);
                roomList.appendChild(div);
            }
        }
    });
}

document.getElementById('btn-create-room-confirm').addEventListener('click', async () => {
    const success = await fetchQuestions();
    if(!success) return;

    const cat = document.getElementById('room-category').value;
    const qCount = parseInt(document.getElementById('room-q-count').value);
    
    let pool = dbQuestions.filter(q => cat === "Wszystkie" || q.category === cat);
    if(pool.length === 0) return alert("Brak pytań dla tej kategorii!");
    
    // Losowanie
    const selected = pool.sort(() => 0.5 - Math.random()).slice(0, qCount);

    const newRoomRef = push(ref(db, 'rooms')); 
    currentRoomId = newRoomRef.key;
    
    await set(newRoomRef, {
        hostName: currentUser.username, status: 'open', category: cat,
        questionCount: selected.length, questions: selected,
        players: { [currentUser.uid]: { username: currentUser.username, avatar: currentUser.avatar, progress: 0, score: 0, status: 'waiting' } }
    });
    switchScreen('screen-room');
    listenToCurrentRoom();
});

async function joinRoom(roomId) {
    currentRoomId = roomId;
    await update(ref(db, `rooms/${roomId}/players/${currentUser.uid}`), {
        username: currentUser.username, avatar: currentUser.avatar, progress: 0, score: 0, status: 'waiting'
    });
    switchScreen('screen-room');
    listenToCurrentRoom();
}

// --- GRA ---
function listenToCurrentRoom() {
    onValue(ref(db, `rooms/${currentRoomId}`), (snapshot) => {
        if(!snapshot.exists()) return;
        currentRoomData = snapshot.val();
        
        // Render graczy w pokoju
        const list = document.getElementById('room-players-list');
        list.innerHTML = Object.values(currentRoomData.players).map(p => 
            `<div class="player-row"><span>${p.avatar} ${p.username}</span><span>${p.progress}/${currentRoomData.questionCount}</span></div>`
        ).join('');

        if (currentRoomData.status === 'finished') {
            switchScreen('screen-results');
            document.getElementById('podium-container').classList.remove('hidden');
            const players = Object.values(currentRoomData.players).sort((a,b) => b.score - a.score);
            document.getElementById('final-leaderboard').innerHTML = players.map((p, i) => 
                `<div class="player-row">${i+1}. ${p.username} - ${p.score} pkt</div>`).join('');
        }
    });
}

document.getElementById('btn-start-my-quiz').addEventListener('click', async () => {
    roomQuestions = currentRoomData.questions;
    myLocalProgress = 0;
    switchScreen('screen-quiz');
    loadNextAsyncQuestion();
});

function loadNextAsyncQuestion() {
    if (myLocalProgress >= roomQuestions.length) {
        finishMyQuiz();
        return;
    }
    const q = roomQuestions[myLocalProgress];
    document.getElementById('quiz-question-text').innerText = q.question;
    const container = document.getElementById('quiz-answer-buttons');
    container.innerHTML = '';
    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.innerText = opt;
        btn.onclick = async () => {
            if (opt === q.answer) myLocalScore++;
            myLocalProgress++;
            await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { progress: myLocalProgress, score: myLocalScore });
            loadNextAsyncQuestion();
        };
        container.appendChild(btn);
    });
}

async function finishMyQuiz() {
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { status: 'completed' });
    const all = Object.values(currentRoomData.players).every(p => p.status === 'completed');
    if (all) await update(ref(db, `rooms/${currentRoomId}`), { status: 'finished' });
    switchScreen('screen-results');
}

document.getElementById('btn-leave-room').addEventListener('click', async () => {
    off(ref(db, `rooms/${currentRoomId}`));
    await remove(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`));
    switchScreen('screen-dashboard');
});
