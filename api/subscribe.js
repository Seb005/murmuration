export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Adresse email invalide." });
  }

  const apiKey = process.env.LOOPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Configuration serveur manquante." });
  }

  const body = {
    email,
    source: "labo.kodra.ca",
  };

  const mailingListId = process.env.LOOPS_MAILING_LIST_ID;
  if (mailingListId) {
    body.mailingLists = { [mailingListId]: true };
  }

  try {
    const response = await fetch("https://app.loops.so/api/v1/contacts/create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok || response.status === 409) {
      return res.status(200).json({ success: true });
    }

    return res.status(502).json({ error: "Impossible de s'inscrire pour le moment." });
  } catch {
    return res.status(500).json({ error: "Une erreur est survenue." });
  }
}
