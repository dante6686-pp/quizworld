import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, push, remove, off } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBeSs0i1oKNUeEbCCi8mWEs6WfxukWAebA",
  authDomain: "quisent-8b6cd.firebaseapp.com",
  databaseURL: "https://quisent-8b6cd-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quisent-8b6cd",
  storageBucket: "quisent-8b6cd.firebasestorage.app",
  messagingSenderId: "537252295249",
  appId: "1:537252295249:web:7174d90b51d794ef973e70"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUser = null, currentRoomId = null, currentRoomData = null, dbQuestions = [], myLocalProgress = 0, myLocalScore = 0;

function debugLog(msg) {
    const log = document.getElementById('debug-log');
    if(log) { log.innerHTML += `<br>> ${msg}`; log.scrollTop = log.scrollHeight; }
    console.log(msg);
}

window.switchScreen = (screenId) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
    document.getElementById(screenId).classList.add('active');
};

async function fetchQuestions() {
    try {
        const resp = await fetch('questions.json');
        dbQuestions = await resp.json();
        debugLog("Pytania pobrane: " + dbQuestions.length);
    } catch(e) { debugLog("BŁĄD PYTAŃ: " + e.message); }
}

document.addEventListener('DOMContentLoaded', () => {
    debugLog("Inicjalizacja aplikacji...");

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const snap = await get(ref(db, 'users/' + user.uid));
            currentUser = { uid: user.uid, ...snap.val() };
            document.getElementById('nav-username').innerText = currentUser.username;
            document.getElementById('navbar').classList.remove('hidden');
            switchScreen('screen-dashboard');
            listenToRooms();
        } else {
            switchScreen('screen-home');
            listenToRooms();
        }
    });

    document.getElementById('btn-login').addEventListener('click', async () => {
        try {
            await signInWithEmailAndPassword(auth, document.getElementById('auth-email').value, document.getElementById('auth-pass').value);
        } catch(e) { debugLog("Błąd logowania: " + e.message); }
    });

    document.getElementById('btn-create-room-confirm').addEventListener('click', async () => {
        await fetchQuestions();
        const cat = document.getElementById('room-category').value;
        const qCount = parseInt(document.getElementById('room-q-count').value);
        let pool = dbQuestions.filter(q => cat === "Wszystkie" || q.category === cat);
        
        if(pool.length === 0) return debugLog("Brak pytań!");
        
        const newRoomRef = push(ref(db, 'rooms'));
        currentRoomId = newRoomRef.key;
        await set(newRoomRef, {
            hostName: currentUser.username, status: 'open', category: cat,
            questions: pool.sort(() => 0.5 - Math.random()).slice(0, qCount),
            players: { [currentUser.uid]: { username: currentUser.username, progress: 0, score: 0, status: 'waiting' } }
        });
        switchScreen('screen-room');
        listenToCurrentRoom();
    });
});

function listenToRooms() {
    onValue(ref(db, 'rooms'), (snap) => {
        const list = document.getElementById('room-list');
        const homeList = document.getElementById('home-room-list');
        [list, homeList].forEach(l => { if(l) l.innerHTML = ''; });
        const rooms = snap.val() || {};
        for (const id in rooms) {
            if (rooms[id].status !== 'finished') {
                const div = document.createElement('div');
                div.className = 'room-item';
                div.innerHTML = `Pokój: ${rooms[id].hostName} (${rooms[id].category})`;
                div.onclick = () => { if(currentUser) joinRoom(id); else alert("Zaloguj się!"); };
                if(list) list.appendChild(div);
                if(homeList) homeList.appendChild(div.cloneNode(true));
            }
        }
    });
}

async function joinRoom(id) {
    currentRoomId = id;
    await update(ref(db, `rooms/${id}/players/${currentUser.uid}`), { username: currentUser.username, progress: 0, score: 0, status: 'waiting' });
    switchScreen('screen-room');
    listenToCurrentRoom();
}

function listenToCurrentRoom() {
    onValue(ref(db, `rooms/${currentRoomId}`), (snap) => {
        currentRoomData = snap.val();
        if(!currentRoomData) return;
        const list = document.getElementById('room-players-list');
        if(list) list.innerHTML = Object.values(currentRoomData.players).map(p => 
            `<div class="player-row"><span>${p.username}</span><span>${p.status === 'completed' ? 'Ukończono' : p.progress + '/' + currentRoomData.questionCount}</span></div>`
        ).join('');

        if (currentRoomData.status === 'finished') {
            switchScreen('screen-results');
            document.getElementById('podium-container').classList.remove('hidden');
            const p = Object.values(currentRoomData.players).sort((a,b) => b.score - a.score);
            document.getElementById('final-leaderboard').innerHTML = p.map(p => `<div>${p.username}: ${p.score}</div>`).join('');
        }
    });
}

document.getElementById('btn-start-my-quiz').addEventListener('click', () => {
    myLocalProgress = 0; myLocalScore = 0;
    switchScreen('screen-quiz');
    loadNextQuestion();
});

function loadNextQuestion() {
    const q = currentRoomData.questions[myLocalProgress];
    if (!q) return finishQuiz();
    document.getElementById('quiz-question-text').innerText = q.question;
    const cont = document.getElementById('quiz-answer-buttons');
    cont.innerHTML = '';
    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.innerText = opt;
        btn.onclick = async () => {
            if(opt === q.answer) myLocalScore++;
            myLocalProgress++;
            await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { progress: myLocalProgress, score: myLocalScore });
            loadNextQuestion();
        };
        cont.appendChild(btn);
    });
}

async function finishQuiz() {
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { status: 'completed' });
    if (Object.values(currentRoomData.players).every(p => p.status === 'completed')) 
        await update(ref(db, `rooms/${currentRoomId}`), { status: 'finished' });
}

document.getElementById('btn-leave-room').addEventListener('click', async () => {
    off(ref(db, `rooms/${currentRoomId}`));
    await remove(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`));
    switchScreen('screen-dashboard');
});

document.getElementById('btn-logout').addEventListener('click', async () => { await signOut(auth); location.reload(); });
document.getElementById('btn-return-to-dash').addEventListener('click', () => switchScreen('screen-dashboard'));
