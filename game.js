import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, push, remove, off } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

let currentUser = null, currentRoomId = null, currentRoomData = null;
let dbQuestions = [], myLocalProgress = 0, myLocalScore = 0, selectedAvatar = '👨‍🚀';

// --- NARZĘDZIA ---
function debugLog(msg) {
    const log = document.getElementById('debug-log');
    if(log) { log.innerHTML += `<br>> ${msg}`; log.scrollTop = log.scrollHeight; }
    console.log(msg);
}

window.switchScreen = (screenId) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(screenId);
    if(el) { el.classList.remove('hidden'); el.classList.add('active'); }
};

async function fetchQuestions() {
    if(dbQuestions.length > 0) return true;
    try {
        debugLog("Pobieram questions.json...");
        const resp = await fetch('questions.json');
        if(!resp.ok) throw new Error("Plik nie istnieje (Błąd 404)");
        dbQuestions = await resp.json();
        debugLog("Udało się. Pytania w bazie: " + dbQuestions.length);
        return true;
    } catch(e) { 
        debugLog("BŁĄD PYTAŃ: " + e.message); 
        return false;
    }
}

// BARDZO WAŻNE: Podpinamy zdarzenia natychmiast!
debugLog("Inicjalizacja aplikacji i podpinanie przycisków...");

// --- AUTORYZACJA ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        debugLog("Zalogowano jako: " + user.email);
        const snap = await get(ref(db, 'users/' + user.uid));
        if(snap.exists()) {
            currentUser = { uid: user.uid, ...snap.val() };
            document.getElementById('nav-username').innerText = currentUser.username;
            document.getElementById('nav-avatar').innerText = currentUser.avatar;
            document.getElementById('navbar').classList.remove('hidden');
            switchScreen('screen-dashboard');
            listenToRooms();
        } else {
            debugLog("Brak profilu w bazie dla tego usera.");
        }
    } else {
        debugLog("Brak zalogowanego użytkownika (widok Home).");
        document.getElementById('navbar').classList.add('hidden');
        switchScreen('screen-home');
        listenToRooms();
    }
});

document.getElementById('btn-login').addEventListener('click', async () => {
    try {
        debugLog("Logowanie...");
        await signInWithEmailAndPassword(auth, document.getElementById('auth-email').value, document.getElementById('auth-pass').value);
    } catch(e) { debugLog("Błąd logowania: " + e.message); alert("Złe dane logowania!"); }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    debugLog("Wylogowywanie...");
    await signOut(auth);
});

// --- REJESTRACJA ---
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
    if(!email || !pass || !username) return alert("Wypełnij wymagane pola!");
    
    try {
        debugLog("Zakładam konto...");
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await set(ref(db, 'users/' + cred.user.uid), { username: username, avatar: selectedAvatar });
        alert("Konto założone! Zaloguj się.");
        document.getElementById('btn-cancel-register').click();
    } catch(e) { debugLog("Błąd rejestracji: " + e.message); alert(e.message); }
});

// --- NAWIGACJA TWORZENIA POKOJU ---
document.getElementById('btn-show-create-room').addEventListener('click', () => {
    debugLog("Przechodzę do formularza tworzenia pokoju.");
    switchScreen('screen-create-room');
});

document.getElementById('btn-back-dashboard').addEventListener('click', () => {
    switchScreen('screen-dashboard');
});

// --- POKOJE ---
function listenToRooms() {
    onValue(ref(db, 'rooms'), (snap) => {
        const list = document.getElementById('room-list');
        const homeList = document.getElementById('home-room-list');
        if(list) list.innerHTML = '';
        if(homeList) homeList.innerHTML = '';
        
        const rooms = snap.val() || {};
        for (const id in rooms) {
            if (rooms[id].status !== 'finished' && rooms[id].hostName) {
                const div = document.createElement('div');
                div.className = 'room-item';
                div.innerHTML = `<div><strong>Pokój: ${rooms[id].hostName}</strong><br><small>${rooms[id].category}</small></div>`;
                div.onclick = () => { 
                    if(currentUser) joinRoom(id); 
                    else alert("Musisz się zalogować, aby dołączyć!"); 
                };
                if(list) list.appendChild(div);
                if(homeList) homeList.appendChild(div.cloneNode(true));
            }
        }
    });
}

document.getElementById('btn-create-room-confirm').addEventListener('click', async () => {
    debugLog("Tworzę nowy pokój...");
    const success = await fetchQuestions();
    if(!success) return;
    
    const cat = document.getElementById('room-category').value;
    const qCount = parseInt(document.getElementById('room-q-count').value);
    
    let pool = dbQuestions.filter(q => cat === "Wszystkie" || q.category === cat);
    if(pool.length === 0) return debugLog("BŁĄD: Brak pytań dla tej kategorii w JSON!");
    
    const selected = pool.sort(() => 0.5 - Math.random()).slice(0, Math.min(qCount, pool.length));

    const newRoomRef = push(ref(db, 'rooms'));
    currentRoomId = newRoomRef.key;
    
    await set(newRoomRef, {
        hostName: currentUser.username, 
        status: 'open', 
        category: cat,
        questionCount: selected.length,
        questions: selected,
        players: { 
            [currentUser.uid]: { username: currentUser.username, avatar: currentUser.avatar, progress: 0, score: 0, status: 'waiting' } 
        }
    });
    
    debugLog("Pokój w bazie. Przechodzę do poczekalni.");
    switchScreen('screen-room');
    listenToCurrentRoom();
});

async function joinRoom(id) {
    debugLog("Dołączam do pokoju: " + id);
    currentRoomId = id;
    await update(ref(db, `rooms/${id}/players/${currentUser.uid}`), { 
        username: currentUser.username, avatar: currentUser.avatar, progress: 0, score: 0, status: 'waiting' 
    });
    switchScreen('screen-room');
    listenToCurrentRoom();
}

function listenToCurrentRoom() {
    onValue(ref(db, `rooms/${currentRoomId}`), (snap) => {
        currentRoomData = snap.val();
        if(!currentRoomData) return;
        
        document.getElementById('room-view-title').innerText = `Pokój: ${currentRoomData.hostName}`;
        
        const list = document.getElementById('room-players-list');
        if(list) {
            list.innerHTML = Object.values(currentRoomData.players).map(p => 
                `<div class="player-row">
                    <span>${p.avatar} <strong>${p.username}</strong></span>
                    <span style="color: ${p.status === 'completed' ? 'var(--success)' : 'var(--warning)'};">
                        ${p.status === 'completed' ? 'Ukończono' : `Pytań: ${p.progress}/${currentRoomData.questionCount}`}
                    </span>
                </div>`
            ).join('');
        }

        if (currentRoomData.status === 'finished') {
            debugLog("Wszyscy skończyli!");
            switchScreen('screen-results');
            document.getElementById('waiting-message').classList.add('hidden');
            document.getElementById('podium-container').classList.remove('hidden');
            
            const p = Object.values(currentRoomData.players).sort((a,b) => b.score - a.score);
            document.getElementById('final-leaderboard').innerHTML = p.map((p, index) => 
                `<div class="player-row"><span>${index + 1}. ${p.avatar} ${p.username}</span><span style="font-weight:bold;">${p.score} pkt</span></div>`
            ).join('');
        } else if(currentRoomData.players[currentUser.uid]?.status === 'completed') {
            switchScreen('screen-results');
            document.getElementById('waiting-message').classList.remove('hidden');
            document.getElementById('podium-container').classList.add('hidden');
            
            const p = Object.values(currentRoomData.players).sort((a,b) => b.progress - a.progress);
            document.getElementById('final-leaderboard').innerHTML = p.map(p => 
                `<div class="player-row"><span>${p.avatar} ${p.username}</span><span>${p.status === 'completed' ? 'Koniec' : `Gra... (${p.progress}/${currentRoomData.questionCount})`}</span></div>`
            ).join('');
        }
    });
}

// --- QUIZ MULTIPLE CHOICE ---
document.getElementById('btn-start-my-quiz').addEventListener('click', async () => {
    debugLog("Start quizu.");
    myLocalProgress = 0; 
    myLocalScore = 0;
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { status: 'in_progress' });
    switchScreen('screen-quiz');
    loadNextQuestion();
});

function loadNextQuestion() {
    const q = currentRoomData.questions[myLocalProgress];
    if (!q) {
        debugLog("Quiz zakończony.");
        return finishQuiz();
    }
    
    document.getElementById('quiz-progress-text').innerText = `Pytanie ${myLocalProgress + 1} z ${currentRoomData.questionCount}`;
    document.getElementById('quiz-progress-bar').style.width = `${(myLocalProgress / currentRoomData.questionCount) * 100}%`;
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
    const players = Object.values(currentRoomData.players);
    if (players.every(p => p.status === 'completed')) {
        debugLog("Ostatni gracz skończył, zamykam pokój.");
        await update(ref(db, `rooms/${currentRoomId}`), { status: 'finished' });
    }
}

document.getElementById('btn-leave-room').addEventListener('click', async () => {
    debugLog("Wychodzę z pokoju.");
    if(currentRoomId) {
        off(ref(db, `rooms/${currentRoomId}`));
        await remove(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`));
        currentRoomId = null;
        switchScreen('screen-dashboard');
    }
});

document.getElementById('btn-return-to-dash').addEventListener('click', () => {
    currentRoomId = null;
    switchScreen('screen-dashboard');
});
