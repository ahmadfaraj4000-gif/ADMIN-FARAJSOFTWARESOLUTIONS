import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || "farajsoftwaresolutions@gmail.com";

const PRODUCTS = [
  { value: "shift_planner", label: "Shift Planner" },
  { value: "pricing_assistant_pro", label: "Pricing Assistant Pro" },
];

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function getExpiryDate(days) {
  if (!days) return null;
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  return date.toISOString();
}

export default function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [users, setUsers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [messages, setMessages] = useState([]);

  const [selectedProduct, setSelectedProduct] = useState("shift_planner");

  const [userSearch, setUserSearch] = useState("");
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState("all");
  const [subscriptionProductFilter, setSubscriptionProductFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = session?.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isAdmin) loadAdminData();
  }, [isAdmin]);

  async function login(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setBusy(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setSession(data.session);
  }

  async function logout() {
    await supabase.auth.signOut();
    setSession(null);
    setUsers([]);
    setSubscriptions([]);
    setMessages([]);
  }

  async function loadAdminData() {
    setLoading(true);
    setError("");

    const [profilesRes, subscriptionsRes, messagesRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("*").order("created_at", { ascending: false }),
      supabase.from("support_messages").select("*").order("created_at", { ascending: false }),
    ]);

    const firstError = profilesRes.error || subscriptionsRes.error || messagesRes.error;
    if (firstError) setError(firstError.message);

    setUsers(profilesRes.data || []);

    const profilesById = Object.fromEntries(
      (profilesRes.data || []).map((profile) => [profile.id, profile])
    );

    setSubscriptions(
      (subscriptionsRes.data || []).map((sub) => ({
        ...sub,
        profile: profilesById[sub.user_id],
      }))
    );

    setMessages(messagesRes.data || []);
    setLoading(false);
  }

  async function grantAccess(userId, product, days = null) {
    setBusy(true);
    setError("");

    const expiresAt = getExpiryDate(days);

    const { error: upsertError } = await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        product,
        status: "active",
        access_source: days ? `admin_${days}_day` : "admin",
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,product" }
    );

    setBusy(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    await loadAdminData();
  }

  async function revokeAccess(subscriptionId) {
    setBusy(true);
    setError("");

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        status: "inactive",
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadAdminData();
  }

  async function saveNote(userId, note) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        admin_notes: note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setUsers((current) =>
      current.map((user) =>
        user.id === userId ? { ...user, admin_notes: note } : user
      )
    );
  }

  async function markMessageStatus(messageId, status) {
    const { error: updateError } = await supabase
      .from("support_messages")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", messageId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, status } : message
      )
    );
  }

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return users;

    return users.filter((user) => {
      const email = user.email?.toLowerCase() || "";
      const name = user.full_name?.toLowerCase() || user.name?.toLowerCase() || "";
      return email.includes(term) || name.includes(term);
    });
  }, [users, userSearch]);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      const matchesStatus =
        subscriptionStatusFilter === "all" || sub.status === subscriptionStatusFilter;

      const matchesProduct =
        subscriptionProductFilter === "all" || sub.product === subscriptionProductFilter;

      return matchesStatus && matchesProduct;
    });
  }, [subscriptions, subscriptionStatusFilter, subscriptionProductFilter]);

  const stats = useMemo(() => {
    return {
      totalUsers: users.length,
      activeSubscribers: subscriptions.filter((sub) => sub.status === "active").length,
      pendingRequests: messages.filter(
        (message) => !message.status || message.status === "pending"
      ).length,
    };
  }, [users, subscriptions, messages]);

  if (loading) return <div className="center-screen">Loading admin portal...</div>;

  if (!session) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={login}>
          <div className="brand-mark">FSS</div>
          <h1>Faraj Software Solutions</h1>
          <p>Admin Portal</p>

          {error && <div className="error">{error}</div>}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Admin email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
            />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="center-screen">
        <div className="blocked-card">
          <h2>Access denied</h2>
          <p>This portal is restricted to the Faraj Software Solutions admin account.</p>
          <p className="muted">Signed in as {session.user.email}</p>
          <button onClick={logout}>Logout</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <div className="eyebrow">Private admin dashboard</div>
          <h1>Faraj Software Solutions Admin Portal</h1>
          <p>Manage users, subscriptions, access, support messages, and customer notes.</p>
        </div>

        <div className="header-actions">
          <button className="secondary" onClick={loadAdminData} disabled={busy}>
            Refresh
          </button>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="stats-grid">
        <div className="stat-card">
          <span>Total Users</span>
          <strong>{stats.totalUsers}</strong>
        </div>
        <div className="stat-card">
          <span>Active Subscribers</span>
          <strong>{stats.activeSubscribers}</strong>
        </div>
        <div className="stat-card">
          <span>Pending Requests</span>
          <strong>{stats.pendingRequests}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Users</h2>

          <div className="admin-controls">
            <input
              className="search-input"
              type="search"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Search users by email or name..."
            />

            <div className="product-picker">
              <span>Grant product:</span>
              <select
                value={selectedProduct}
                onChange={(event) => setSelectedProduct(event.target.value)}
              >
                {PRODUCTS.map((product) => (
                  <option key={product.value} value={product.value}>
                    {product.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Created</th>
                <th>Admin Notes</th>
                <th>Access</th>
              </tr>
            </thead>

            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.email || "No email"}</td>
                  <td>{user.full_name || user.name || "—"}</td>
                  <td>{formatDate(user.created_at)}</td>
                  <td>
                    <textarea
                      defaultValue={user.admin_notes || ""}
                      placeholder="Add notes..."
                      onBlur={(event) => saveNote(user.id, event.target.value)}
                    />
                  </td>
                  <td>
                    <div className="grant-actions">
                      <button
                        disabled={busy}
                        onClick={() => grantAccess(user.id, selectedProduct, null)}
                      >
                        Ongoing
                      </button>

                      <button
                        disabled={busy}
                        onClick={() => grantAccess(user.id, selectedProduct, 7)}
                      >
                        7 Day
                      </button>

                      <button
                        disabled={busy}
                        onClick={() => grantAccess(user.id, selectedProduct, 30)}
                      >
                        30 Day
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="5">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Subscriptions</h2>

          <div className="admin-controls compact">
            <div className="product-picker">
              <span>Status:</span>
              <select
                value={subscriptionStatusFilter}
                onChange={(event) => setSubscriptionStatusFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>

            <div className="product-picker">
              <span>Product:</span>
              <select
                value={subscriptionProductFilter}
                onChange={(event) => setSubscriptionProductFilter(event.target.value)}
              >
                <option value="all">All products</option>
                {PRODUCTS.map((product) => (
                  <option key={product.value} value={product.value}>
                    {product.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Product</th>
                <th>Status</th>
                <th>Source</th>
                <th>Stripe Customer</th>
                <th>Expires</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredSubscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td>{sub.profile?.email || sub.user_id}</td>
                  <td>{sub.product}</td>
                  <td>
                    <span
                      className={
                        sub.status === "active" ? "badge active" : "badge inactive"
                      }
                    >
                      {sub.status}
                    </span>
                  </td>
                  <td>{sub.access_source || "stripe"}</td>
                  <td>{sub.stripe_customer_id || "—"}</td>
                  <td>{formatDate(sub.expires_at)}</td>
                  <td>{formatDate(sub.created_at)}</td>
                  <td>
                    {sub.status === "active" ? (
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => revokeAccess(sub.id)}
                      >
                        Revoke
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}

              {filteredSubscriptions.length === 0 && (
                <tr>
                  <td colSpan="8">No subscriptions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Support / Messages</h2>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Subject</th>
                <th>Message</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {messages.map((message) => (
                <tr key={message.id}>
                  <td>{message.email || "—"}</td>
                  <td>{message.subject || "—"}</td>
                  <td className="message-cell">{message.message || message.body || "—"}</td>
                  <td>{message.status || "pending"}</td>
                  <td>{formatDate(message.created_at)}</td>
                  <td>
                    <button
                      className="secondary"
                      onClick={() => markMessageStatus(message.id, "open")}
                    >
                      Open
                    </button>
                    <button onClick={() => markMessageStatus(message.id, "resolved")}>
                      Resolved
                    </button>
                  </td>
                </tr>
              ))}

              {messages.length === 0 && (
                <tr>
                  <td colSpan="6">No support messages found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
