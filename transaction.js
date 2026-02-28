import { LedgerApp, db, auth } from './app.js';
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const partyId = LedgerApp.getParam('id');
let currentParty = null;
let selectedTx = null;
let allTransactions = [];
let globalCalculatedBal = 0;

const skeletonLoader = document.getElementById('skeleton-loader');
const mainContent = document.getElementById('main-content');

// --- Dropdown Menu ---
document.getElementById('menuBtn').onclick = (e) => {
    e.stopPropagation();
    const m = document.getElementById('dropdownMenu');
    m.style.display = m.style.display === 'block' ? 'none' : 'block';
};
window.onclick = () => document.getElementById('dropdownMenu').style.display = 'none';

// --- Party Operations ---
document.getElementById('editPartyBtn').onclick = () => {
    document.getElementById('editName').value = currentParty.name;
    document.getElementById('editMobile').value = currentParty.mobile || "";
    document.getElementById('editModal').style.display = 'flex';
};

document.getElementById('editPartyForm').onsubmit = async (e) => {
    e.preventDefault();
    const newName = document.getElementById('editName').value;
    const newMobile = document.getElementById('editMobile').value;
    await updateDoc(doc(db, "parties", partyId), { name: newName, mobile: newMobile });
    document.getElementById('editModal').style.display = 'none';
    refreshUI();
};

document.getElementById('deletePartyBtn').onclick = async () => {
    if (confirm(`Delete ${currentParty.name} and all data?`)) {
        await deleteDoc(doc(db, "parties", partyId));
        window.location.href = 'dashboard.html';
    }
};

// --- Transaction Actions ---
window.showOptions = (txId, amount, type) => {
    selectedTx = { id: txId, amount, type };
    document.getElementById('actionSheet').style.display = 'flex';
};

document.getElementById('deleteBtnUI').onclick = async () => {
    if (!confirm("Delete entry?")) return;
    const adj = (selectedTx.type === 'Got') ? -Number(selectedTx.amount) : Number(selectedTx.amount);
    await deleteDoc(doc(db, "transactions", selectedTx.id));
    await updateDoc(doc(db, "parties", partyId), { balance: (currentParty.balance || 0) + adj });
    refreshUI();
};

document.getElementById('editBtnUI').onclick = () =>
    window.location.href = `add-entry.html?id=${partyId}&txId=${selectedTx.id}&mode=edit&type=${selectedTx.type}`;

document.getElementById('navGave').onclick = () => window.location.href = `add-entry.html?id=${partyId}&type=Gave`;
document.getElementById('navGot').onclick = () => window.location.href = `add-entry.html?id=${partyId}&type=Got`;

// --- Fetch & Update UI ---
async function refreshUI() {
    if (!partyId) return;
    try {
        const pSnap = await getDoc(doc(db, "parties", partyId));
        if (pSnap.exists()) {
            currentParty = pSnap.data();
            document.getElementById('party-name-title').innerText = currentParty.name;
        }

        const q = query(collection(db, "transactions"), where("partyId", "==", partyId), orderBy("date", "desc"), orderBy("timestamp", "desc"));
        const tSnap = await getDocs(q);
        allTransactions = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const calculatedBal = allTransactions.reduce((acc, t) => {
            return t.type === 'Got' ? acc + Number(t.amount) : acc - Number(t.amount);
        }, 0);

        globalCalculatedBal = calculatedBal;

        const balEl = document.getElementById('balance-amt');
        balEl.innerText = `₹${Math.abs(calculatedBal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        balEl.style.color = calculatedBal >= 0 ? 'var(--primary)' : '#ff5252';
        document.getElementById('balance-sub').innerText = calculatedBal >= 0 ? "You will get" : "You will give";

        if (allTransactions.length > 0) {
            const lastDate = new Date(allTransactions[0].date);
            const diff = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
            document.getElementById('due-status-container').innerHTML = `<div class="due-badge"><span class="material-symbols-outlined" style="font-size:16px;">history</span> Last activity ${diff} days ago</div>`;
        }

        document.getElementById('tx-list-container').innerHTML = allTransactions.map(t => `
            <div class="tx-card" onclick="showOptions('${t.id}', ${t.amount}, '${t.type}')">
                <div><p class="tx-date">${t.date}</p><p class="tx-desc">${t.description || 'Entry'}</p></div>
                <p class="tx-amount" style="color: ${t.type === 'Got' ? 'var(--primary)' : '#ff5252'};">${t.type === 'Got' ? '+' : '-'} ₹${Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>`).join('');
    } catch (error) {
        console.error("Failed to load transactions:", error);
    } finally {
        skeletonLoader.style.display = 'none';
        mainContent.style.display = 'block';
    }
}

// --- Reminder & Reports ---
document.getElementById('whatsappReminder').onclick = async () => {
    if (!currentParty || !currentParty.mobile) {
        alert("Please add a mobile number first.");
        return;
    }
    const user = auth.currentUser;
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const shopData = userSnap.data() || { shopName: "My Ledger", mobile: "N/A" };
    const phone = currentParty.mobile.replace(/\D/g, '');
    const balanceStr = Math.abs(globalCalculatedBal).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    let msg = globalCalculatedBal > 0
        ? `${shopData.shopName}(${shopData.mobile}) confirmed your payment of ₹${balanceStr}.`
        : `${shopData.shopName}(${shopData.mobile}) requested payment of ₹${balanceStr}.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
};

document.getElementById('generateReport').onclick = async () => {
    const { jsPDF } = window.jspdf;
    const pdfDoc = new jsPDF();
    const user = auth.currentUser;
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const shopData = userSnap.data() || { shopName: "My Ledger", mobile: "" };

    pdfDoc.setFont("helvetica", "bold").setFontSize(22);
    pdfDoc.text(shopData.shopName, 105, 20, { align: "center" });
    pdfDoc.line(14, 40, 196, 40);
    pdfDoc.text(`Customer: ${currentParty.name}`, 14, 50);
    pdfDoc.text(`Total Balance: Rs. ${Math.abs(globalCalculatedBal).toLocaleString()}`, 14, 58);

    pdfDoc.autoTable({
        startY: 68,
        head: [['Date', 'Description', 'Gave (-)', 'Got (+)']],
        body: allTransactions.map(t => [t.date, t.description || '-', t.type === 'Gave' ? t.amount : '-', t.type === 'Got' ? t.amount : '-']),
        headStyles: { fillColor: [19, 236, 91], textColor: [16, 34, 22] },
        theme: 'striped'
    });
    pdfDoc.save(`${currentParty.name}_Ledger.pdf`);
};

onAuthStateChanged(auth, (u) => u ? refreshUI() : window.location.href = 'signin.html');