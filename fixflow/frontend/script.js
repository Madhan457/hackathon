import {
  auth,
  db,
  firebaseConfigurationError,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
} from "./firebase.js";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const VALID_STATUSES = new Set(["OPEN", "IN_PROGRESS", "RESOLVED"]);
const VALID_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);

const elements = {
  form: document.querySelector("#fault-form"),
  formError: document.querySelector("#form-error"),
  submitButton: document.querySelector("#submit-button"),
  reportsBody: document.querySelector("#reports-body"),
  emptyState: document.querySelector("#empty-state"),
  loadingState: document.querySelector("#loading-state"),
  search: document.querySelector("#search-input"),
  statusFilter: document.querySelector("#status-filter"),
  priorityFilter: document.querySelector("#priority-filter"),
  visibleCount: document.querySelector("#visible-count"),
  toastRegion: document.querySelector("#toast-region"),
  connectionDot: document.querySelector("#connection-dot"),
  connectionLabel: document.querySelector("#connection-label"),
  loginButton: document.querySelector("#maintenance-login"),
  signoutButton: document.querySelector("#maintenance-signout"),
  loginDialog: document.querySelector("#login-dialog"),
  loginForm: document.querySelector("#login-form"),
  loginEmail: document.querySelector("#login-email"),
  loginPassword: document.querySelector("#login-password"),
  loginError: document.querySelector("#login-error"),
  loginSubmit: document.querySelector("#login-submit")
};

let reports = [];
let currentUser = null;
let unsubscribeReports = null;
let toastTimeout;

function isMaintenanceUser(user) {
  return Boolean(user?.email && !user.isAnonymous);
}

function firebaseErrorMessage(error) {
  const code = error?.code || "";
  if (code === "permission-denied") {
    return "Firestore denied this operation. Check firestore.rules and the maintenance email allowlist.";
  }
  if (code === "failed-precondition") {
    return "Cloud Firestore is not ready. Create the Firestore database in Firebase Console.";
  }
  if (code === "unavailable" || code === "deadline-exceeded" || code === "auth/network-request-failed") {
    return "Firebase is unavailable. Check your internet connection and try again.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Enable Anonymous and Email/Password sign-in in Firebase Authentication.";
  }
  if (code === "auth/configuration-not-found") {
    return "Firebase Authentication is not configured for this project. In Firebase Console, open Authentication, click Get started, and enable Anonymous sign-in. Also confirm this Web API key belongs to hackathon-d2299.";
  }
  if (code === "auth/invalid-api-key") {
    return "Firebase configuration is invalid. Copy the Web app config from Firebase Console.";
  }
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code)) {
    return "The maintenance email or password was not accepted.";
  }
  if (code === "invalid-argument") {
    return "Firestore rejected the report data. Check the required fields and value limits.";
  }
  if (code === "auth/too-many-requests") {
    return "Firebase temporarily blocked sign-in attempts. Wait a moment and try again.";
  }
  return error?.message || "Firebase request failed. Check the Firebase project configuration.";
}

function setConnection(connected, message) {
  elements.connectionDot.classList.toggle("connected", connected);
  elements.connectionLabel.textContent = message;
}

function showEmptyState(title, message) {
  elements.loadingState.hidden = true;
  elements.emptyState.hidden = false;
  document.querySelector("#empty-title").textContent = title;
  document.querySelector("#empty-copy").textContent = message;
}

function clearStats() {
  ["#stat-total", "#stat-open", "#stat-progress", "#stat-resolved", "#stat-urgent", "#nav-total", "#visible-count"]
    .forEach((selector) => { document.querySelector(selector).textContent = "—"; });
}

function clearReportData() {
  reports = [];
  elements.reportsBody.replaceChildren();
  clearStats();
}

function updateAuthControls(user) {
  const maintenance = isMaintenanceUser(user);
  elements.loginButton.hidden = maintenance;
  elements.signoutButton.hidden = !maintenance;
  elements.signoutButton.setAttribute("aria-label", user?.email ? `Sign out ${user.email}` : "Sign out");
}

function stopListening() {
  if (unsubscribeReports) unsubscribeReports();
  unsubscribeReports = null;
}

function startReportListener() {
  stopListening();
  elements.loadingState.hidden = false;
  elements.emptyState.hidden = true;
  unsubscribeReports = onSnapshot(collection(db, "faultReports"), (snapshot) => {
    reports = snapshot.docs.map(normalizeReport);
    setConnection(true, "Maintenance connected");
    updateStats();
    renderReports();
  }, (error) => {
    clearReportData();
    setConnection(false, "Firestore unavailable");
    showEmptyState("Unable to load fault reports", firebaseErrorMessage(error));
    showToast(firebaseErrorMessage(error), "error");
  });
}

function handleAuthState(user) {
  const sameUser = currentUser?.uid === user?.uid;
  currentUser = user;
  if (!isMaintenanceUser(user) || !sameUser) {
    stopListening();
    clearReportData();
  }
  updateAuthControls(user);
  elements.submitButton.disabled = !user;

  if (!user) {
    setConnection(false, "Signing in to Firebase");
    elements.loadingState.hidden = false;
    signInAnonymously(auth).catch((error) => {
      elements.submitButton.disabled = true;
      setConnection(false, "Authentication unavailable");
      showEmptyState("Firebase sign-in failed", firebaseErrorMessage(error));
      showToast(firebaseErrorMessage(error), "error");
    });
    return;
  }

  if (isMaintenanceUser(user)) {
    startReportListener();
    return;
  }

  stopListening();
  clearReportData();
  setConnection(true, "Reporting access ready");
  showEmptyState("Maintenance sign-in required", "Sign in with an authorized maintenance account to view reports and dashboard totals.");
}

function normalizeStatus(value) {
  const normalized = String(value || "OPEN").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return VALID_STATUSES.has(normalized) ? normalized : "OPEN";
}

function normalizePriority(value) {
  const normalized = String(value || "LOW").trim().toUpperCase();
  return VALID_PRIORITIES.has(normalized) ? normalized : "LOW";
}

function normalizeReport(reportDocument) {
  const data = reportDocument.data();
  return {
    id: reportDocument.id,
    equipmentName: String(data.equipmentName || "").trim(),
    location: String(data.location || "").trim(),
    description: String(data.description || "").trim(),
    reporterName: String(data.reporterName || "").trim(),
    priority: normalizePriority(data.priority),
    status: normalizeStatus(data.status),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null
  };
}

function updateStats() {
  const counts = {
    total: reports.length,
    open: reports.filter((report) => report.status === "OPEN").length,
    progress: reports.filter((report) => report.status === "IN_PROGRESS").length,
    resolved: reports.filter((report) => report.status === "RESOLVED").length,
    urgent: reports.filter((report) => report.priority === "HIGH" && report.status !== "RESOLVED").length
  };
  document.querySelector("#stat-total").textContent = counts.total;
  document.querySelector("#stat-open").textContent = counts.open;
  document.querySelector("#stat-progress").textContent = counts.progress;
  document.querySelector("#stat-resolved").textContent = counts.resolved;
  document.querySelector("#stat-urgent").textContent = counts.urgent;
  document.querySelector("#nav-total").textContent = counts.total;
}

function timestampMillis(value) {
  if (value?.toMillis) return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function priorityRank(report) {
  const priority = normalizePriority(report.priority);
  const status = normalizeStatus(report.status);
  if (priority === "HIGH" && status !== "RESOLVED") return 0;
  if (priority === "HIGH") return 1;
  if (priority === "MEDIUM") return 2;
  return 3;
}

function renderReports() {
  const query = elements.search.value.trim().toLocaleLowerCase();
  const visibleReports = reports
    .filter((report) => !elements.statusFilter.value || report.status === elements.statusFilter.value)
    .filter((report) => !elements.priorityFilter.value || report.priority === elements.priorityFilter.value)
    .filter((report) => `${report.equipmentName} ${report.location}`.toLocaleLowerCase().includes(query))
    .sort((left, right) => priorityRank(left) - priorityRank(right)
      || timestampMillis(right.createdAt) - timestampMillis(left.createdAt));

  elements.reportsBody.replaceChildren(...visibleReports.map(createReportRow));
  elements.visibleCount.textContent = visibleReports.length;
  elements.emptyState.hidden = visibleReports.length > 0;
  if (visibleReports.length === 0) {
    const filtered = Boolean(query || elements.statusFilter.value || elements.priorityFilter.value);
    showEmptyState(filtered ? "No matching reports" : "No fault reports yet",
      filtered ? "Try a different search or adjust your filters." : "New fault reports will appear here.");
  }
  elements.loadingState.hidden = true;
  if (window.lucide) window.lucide.createIcons();
}

function createReportRow(report) {
  const row = document.createElement("tr");
  const faultCell = document.createElement("td");
  const faultName = document.createElement("strong");
  faultName.className = "fault-name";
  faultName.textContent = report.equipmentName || "Unnamed equipment";
  const description = document.createElement("span");
  description.className = "fault-description";
  description.textContent = report.description || "";
  const faultId = document.createElement("span");
  faultId.className = "fault-id";
  faultId.textContent = `#${report.id}`;
  faultCell.append(faultName, description, faultId);

  const locationCell = document.createElement("td");
  locationCell.className = "location-cell";
  locationCell.textContent = report.location || "—";
  const reporterCell = document.createElement("td");
  reporterCell.className = "location-cell";
  reporterCell.textContent = report.reporterName || "—";
  const priorityCell = document.createElement("td");
  const priorityBadge = document.createElement("span");
  priorityBadge.className = `badge priority-${String(report.priority || "low").toLowerCase()}`;
  priorityBadge.textContent = titleCase(report.priority || "LOW");
  priorityCell.append(priorityBadge);
  const statusCell = document.createElement("td");
  const statusBadge = document.createElement("span");
  statusBadge.className = `badge status-${String(report.status || "open").toLowerCase().replace("_", "-")}`;
  statusBadge.textContent = titleCase(report.status || "OPEN");
  statusCell.append(statusBadge);
  const dateCell = document.createElement("td");
  dateCell.className = "date-cell";
  dateCell.textContent = formatDate(report.createdAt);
  const actionCell = document.createElement("td");
  const actionSelect = document.createElement("select");
  actionSelect.className = "status-control";
  actionSelect.setAttribute("aria-label", `Update status for ${report.equipmentName || "fault report"}`);
  actionSelect.dataset.reportId = report.id;
  actionSelect.dataset.currentStatus = report.status;
  ["OPEN", "IN_PROGRESS", "RESOLVED"].forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = titleCase(status);
    option.selected = report.status === status;
    actionSelect.append(option);
  });
  actionCell.append(actionSelect);
  row.append(faultCell, locationCell, reporterCell, priorityCell, statusCell, dateCell, actionCell);
  return row;
}

function titleCase(value) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatDate(value) {
  if (!value) return "Pending sync";
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
  }).format(date);
}

function showToast(message, type = "success") {
  clearTimeout(toastTimeout);
  elements.toastRegion.replaceChildren();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", type === "success" ? "circle-check" : "circle-alert");
  const text = document.createElement("span");
  text.textContent = message;
  toast.append(icon, text);
  elements.toastRegion.append(toast);
  if (window.lucide) window.lucide.createIcons();
  toastTimeout = setTimeout(() => toast.remove(), 4500);
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.formError.textContent = "";
  if (!elements.form.reportValidity()) return;
  if (!currentUser) {
    elements.formError.textContent = "Firebase sign-in is not ready. Wait a moment and try again.";
    return;
  }

  const formData = new FormData(elements.form);
  const equipmentName = String(formData.get("equipmentName") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const reporterName = String(formData.get("reporterName") || "").trim();
  if (!equipmentName || !location || !description) {
    elements.formError.textContent = "Equipment, location, and description are required.";
    return;
  }

  elements.submitButton.disabled = true;
  elements.submitButton.querySelector("span").textContent = "Submitting...";
  elements.submitButton.classList.add("is-loading");
  try {
    await addDoc(collection(db, "faultReports"), {
      equipmentName,
      location,
      description,
      priority: String(formData.get("priority") || "MEDIUM"),
      reporterName,
      status: "OPEN",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    elements.form.reset();
    showToast("Fault report submitted successfully.");
  } catch (error) {
    const message = firebaseErrorMessage(error);
    elements.formError.textContent = message;
    showToast(message, "error");
  } finally {
    elements.submitButton.disabled = !currentUser;
    elements.submitButton.querySelector("span").textContent = "Submit report";
    elements.submitButton.classList.remove("is-loading");
  }
});

elements.reportsBody.addEventListener("change", async (event) => {
  const control = event.target.closest(".status-control");
  if (!control || control.value === control.dataset.currentStatus) return;
  const nextStatus = control.value;
  if (nextStatus === "RESOLVED" && !window.confirm("Mark this fault as resolved?")) {
    control.value = control.dataset.currentStatus;
    return;
  }

  control.disabled = true;
  try {
    await updateDoc(doc(db, "faultReports", control.dataset.reportId), {
      status: nextStatus,
      updatedAt: serverTimestamp()
    });
    showToast("Fault status updated.");
  } catch (error) {
    control.value = control.dataset.currentStatus;
    showToast(firebaseErrorMessage(error), "error");
  } finally {
    control.disabled = false;
  }
});

elements.search.addEventListener("input", renderReports);
elements.statusFilter.addEventListener("change", renderReports);
elements.priorityFilter.addEventListener("change", renderReports);
elements.loginButton.addEventListener("click", () => elements.loginDialog.showModal());
document.querySelector("#login-close").addEventListener("click", () => elements.loginDialog.close());
elements.signoutButton.addEventListener("click", () => signOut(auth).catch((error) => showToast(firebaseErrorMessage(error), "error")));
elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginError.textContent = "";
  const email = elements.loginEmail.value.trim().toLowerCase();
  elements.loginSubmit.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, elements.loginPassword.value);
    elements.loginDialog.close();
    elements.loginForm.reset();
    showToast("Maintenance sign in successful.");
  } catch (error) {
    elements.loginError.textContent = firebaseErrorMessage(error);
  } finally {
    elements.loginSubmit.disabled = false;
  }
});
document.querySelector("#refresh-button").addEventListener("click", () => {
  if (currentUser && isMaintenanceUser(currentUser)) startReportListener();
});
document.querySelector("#table-refresh").addEventListener("click", () => {
  if (currentUser && isMaintenanceUser(currentUser)) startReportListener();
});
document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric"
}).format(new Date());

if (window.lucide) window.lucide.createIcons();
elements.submitButton.disabled = true;

if (firebaseConfigurationError) {
  setConnection(false, "Firebase configuration required");
  showEmptyState("Firebase configuration required", `${firebaseConfigurationError.message} Update frontend/firebase.js.`);
  elements.loginButton.disabled = true;
} else {
  elements.loadingState.hidden = false;
  onAuthStateChanged(auth, handleAuthState, (error) => {
    setConnection(false, "Firebase Authentication error");
    showEmptyState("Firebase sign-in failed", firebaseErrorMessage(error));
    showToast(firebaseErrorMessage(error), "error");
  });
}