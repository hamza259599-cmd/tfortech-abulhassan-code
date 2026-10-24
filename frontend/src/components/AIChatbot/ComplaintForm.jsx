import React, { useState } from "react";
import { FaArrowLeft, FaEnvelope } from "react-icons/fa";

const FIELDS = [
  { key: "name", label: "Full Name", required: true },
  { key: "phone", label: "Phone / WhatsApp", required: true, type: "tel" },
  { key: "orderId", label: "Order ID" },
  { key: "orderDate", label: "Order Date", type: "date" },
  { key: "product", label: "Product Name", required: true },
];

const EMPTY_FORM = {
  name: "",
  phone: "",
  orderId: "",
  orderDate: "",
  product: "",
  problem: "",
  want: "Repair",
};

const ComplaintForm = ({ email, onBack }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const update = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (
      !form.name.trim() ||
      !form.phone.trim() ||
      !form.product.trim() ||
      !form.problem.trim()
    ) {
      setError("Please fill Name, Phone, Product and Problem Details.");
      return;
    }

    setError("");

    const body = [
      "Assalam o Alaikum T For Tech Team,",
      "",
      "I want to register a complaint. My details are below:",
      "",
      "Full Name: " + form.name.trim(),
      "Phone / WhatsApp: " + form.phone.trim(),
      "Order ID: " + (form.orderId.trim() || "-"),
      "Order Date: " + (form.orderDate || "-"),
      "Product Name: " + form.product.trim(),
      "",
      "Problem Details:",
      form.problem.trim(),
      "",
      "What I want: " + form.want,
      "",
      "Please resolve this as soon as possible.",
      "",
      "Thank you.",
    ].join("\n");

    const url =
      "https://mail.google.com/mail/?view=cm&fs=1&to=" +
      encodeURIComponent(email) +
      "&su=" +
      encodeURIComponent("Complaint - T For Tech - " + form.name.trim()) +
      "&body=" +
      encodeURIComponent(body);

    window.open(url, "_blank", "noopener,noreferrer");
    setSent(true);
  };

  return (
    <form className="ai-complaint" onSubmit={handleSubmit}>
      <button type="button" className="ai-complaint-back" onClick={onBack}>
        <FaArrowLeft /> Back to chat
      </button>

      <div className="ai-complaint-title">Register a Complaint</div>
      <p className="ai-complaint-note">
        Fill in your details. Gmail will open with your complaint ready to send
        to {email}.
      </p>

      {FIELDS.map((field) => (
        <label key={field.key} className="ai-complaint-field">
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <input
            type={field.type || "text"}
            value={form[field.key]}
            onChange={update(field.key)}
            maxLength={120}
          />
        </label>
      ))}

      <label className="ai-complaint-field">
        <span>Problem Details *</span>
        <textarea
          rows={4}
          value={form.problem}
          onChange={update("problem")}
          maxLength={1500}
          placeholder="Describe the issue..."
        />
      </label>

      <label className="ai-complaint-field">
        <span>What do you want?</span>
        <select value={form.want} onChange={update("want")}>
          <option>Repair</option>
          <option>Replacement</option>
          <option>Refund</option>
          <option>Other</option>
        </select>
      </label>

      {error && <div className="ai-complaint-error">{error}</div>}

      {sent && (
        <div className="ai-complaint-success">
          Gmail opened in a new tab. Attach photos/videos if any, then press
          Send.
        </div>
      )}

      <button type="submit" className="ai-complaint-submit">
        <FaEnvelope /> Send Complaint via Gmail
      </button>
    </form>
  );
};

export default ComplaintForm;
