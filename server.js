// ==========================================
// IMPORTATION DES MODULES INTERNES NODE.JS
// ==========================================
const http = require("node:http"); // Module natif pour créer le serveur HTTP
const fs = require("node:fs");     // Module natif pour interagir avec le système de fichiers (lecture/écriture)
const path = require("node:path"); // Module natif pour manipuler les chemins de fichiers de façon multiplateforme
const bcrypt = require("bcrypt");   // Module externe de hachage sécurisé pour les mots de passe
const { v4: uuidv4 } = require("uuid"); // Générateur d'UUID version 4 uniques pour les identifiants
const db = require("./db");        // Fichier local pour récupérer la connexion MySQL

// ==========================================
// CONFIGURATION DU SERVEUR
// ==========================================
const PORT = 3001; // Port d'écoute du serveur
const PUBLIC_DIR = path.join(__dirname); // Racine publique (dossier actuel) pour servir les fichiers statiques

// Table de hachage en mémoire vive pour stocker les sessions actives
// Structure : { "sessionId_uuid": { id, uuid, username, email } }
const sessions = {};

// ==========================================
// FONCTIONS UTILITAIRES / MIDDLEWARES MAISON
// ==========================================

/**
 * Envoie une réponse formatée en JSON au format standardisé.
 * Ajoute également les en-têtes nécessaires pour le CORS (partage des ressources d'origines différentes).
 * @param {object} res - Objet Response HTTP de Node.
 * @param {number} statusCode - Code de statut HTTP (200, 201, 400, etc.).
 * @param {object} data - Objet JavaScript à sérialiser en JSON.
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(data));
}

/**
 * Lit et parse le corps textuel (body) d'une requête POST/PUT en asynchrone.
 * Reconstruit le flux de buffers reçus et le convertit en objet JSON.
 * @param {object} req - Objet Request HTTP de Node.
 * @returns {Promise<object>} Promesse résolue avec l'objet JSON parsé.
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    // Écoute les paquets de données envoyés par le client
    req.on("data", chunk => {
      body += chunk.toString();
    });

    // Dès que la transmission est finie, on parse le JSON
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

/**
 * Analyse et extrait les cookies contenus dans les en-têtes HTTP du navigateur.
 * @param {object} req - Objet Request HTTP de Node.
 * @returns {object} Dictionnaire des cookies { nom: valeur }.
 */
function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};

  if (!header) return cookies;

  // Découpe la chaîne (ex: "sessionId=123; user=abc") en paires clés/valeurs
  header.split(";").forEach(cookie => {
    const parts = cookie.split("=");
    const key = parts[0]?.trim();
    const value = parts[1]?.trim();
    if (key) cookies[key] = value;
  });

  return cookies;
}

/**
 * Fonction maîtresse pour servir les fichiers statiques de ton frontend (HTML, CSS, JS, Images).
 * Lit le fichier demandé sur le disque dur et le retourne avec le Content-Type adapté.
 * @param {object} res - Objet Response HTTP.
 * @param {string} pathname - Chemin d'accès demandé (ex: "/style.css").
 */
function serveStatic(res, pathname) {
  // Par défaut, redirige la racine "/" vers le fichier principal "/index.html"
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.join(PUBLIC_DIR, decodeURIComponent(filePath));

  const ext = path.extname(filePath).toLowerCase();
  
  // Dictionnaire de correspondances pour les extensions
  const contentTypes = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };

  // Sécurité anti-traversée de répertoire (empêche d'accéder aux fichiers système en dehors de la racine)
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Accès refusé");
  }

  // Lecture physique asynchrone du fichier
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Fichier non trouvé");
    }

    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

/**
 * Récupère l'utilisateur en mémoire vive correspondant au cookie sessionId fourni par la requête.
 * @param {object} req - Objet Request HTTP.
 * @returns {object|null} L'objet utilisateur de session ou null si non connecté.
 */
function getUserFromSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.sessionId;

  if (!sessionId || !sessions[sessionId]) {
    return null; // Cookie invalide ou expiré
  }

  return sessions[sessionId];
}

// ==========================================
// CRÉATION ET LOGIQUE DU SERVEUR WEB
// ==========================================
const server = http.createServer(async (req, res) => {
  // Utilisation de l'API moderne standardisé new URL pour extraire proprement la route
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // 1. ROUTAGE STATIQUE : Intercepte les fichiers du frontend (GET)
  if (method === "GET" && (pathname === "/" || pathname.endsWith(".html") || pathname.endsWith(".css") || pathname.endsWith(".js") || pathname.endsWith(".png") || pathname.endsWith(".jpg") || pathname.endsWith(".jpeg") || pathname.endsWith(".svg") || pathname.endsWith(".ico"))) {
    return serveStatic(res, pathname);
  }

  // 2. ROUTAGE CORS : Répond positivement aux requêtes préliminaires (Preflight) des navigateurs
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE"
    });
    return res.end();
  }

  // ==========================================
  // ROUTES D'AUTHENTIFICATION & COMPTES
  // ==========================================

  // 3. INSCRIPTION : POST /register
  if (pathname === "/register" && method === "POST") {
    try {
      const { username, email, password } = await parseBody(req);

      // Validation de surface des champs
      if (!username || !email || !password) {
        return sendJson(res, 400, { error: "Tous les champs sont obligatoires" });
      }

      // Vérifie l'unicité de l'email ou du pseudo en BDD
      db.query(
        "SELECT * FROM users WHERE email = ? OR username = ?",
        [email, username],
        async (err, results) => {
          if (err) {
            return sendJson(res, 500, { error: "Erreur serveur" });
          }

          if (results.length > 0) {
            return sendJson(res, 400, { error: "Email ou username déjà utilisé" });
          }

          try {
            // Hache le mot de passe de façon sécurisée (coût de salage de 10 passes)
            const hashedPassword = await bcrypt.hash(password, 10);
            const userUuid = uuidv4();

            // Insère le nouvel utilisateur en base
            db.query(
              "INSERT INTO users (uuid, username, email, password) VALUES (?, ?, ?, ?)",
              [userUuid, username, email, hashedPassword],
              (err2) => {
                if (err2) {
                  console.error("Register insert error:", err2);
                  return sendJson(res, 500, { error: "Erreur insertion utilisateur" });
                }

                sendJson(res, 201, { message: "Inscription réussie" });
              }
            );
          } catch (hashError) {
            sendJson(res, 500, { error: "Erreur hash mot de passe" });
          }
        }
      );
    } catch (error) {
      return sendJson(res, 400, { error: "JSON invalide" });
    }
    return;
  }

  // 4. CONNEXION : POST /login
  if (pathname === "/login" && method === "POST") {
    try {
      const { email, password } = await parseBody(req);

      if (!email || !password) {
        return sendJson(res, 400, { error: "Email et mot de passe requis" });
      }

      // Récupère l'utilisateur par son email
      db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) {
          return sendJson(res, 500, { error: "Erreur serveur" });
        }

        if (results.length === 0) {
          return sendJson(res, 400, { error: "Utilisateur introuvable" });
        }

        const user = results[0];
        
        // Compare le mot de passe en clair envoyé avec le hash de la BDD
        const valid = await bcrypt.compare(password, user.password);

        if (!valid) {
          return sendJson(res, 400, { error: "Mot de passe incorrect" });
        }

        // Crée une session utilisateur en mémoire
        const sessionId = uuidv4();
        sessions[sessionId] = {
          id: user.id,
          uuid: user.uuid,
          username: user.username,
          email: user.email
        };

        // Définit le cookie sessionId de façon HttpOnly pour contrer les failles XSS
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Set-Cookie": `sessionId=${sessionId}; HttpOnly; Path=/`
        });

        res.end(JSON.stringify({
          message: "Connexion réussie",
          user: sessions[sessionId]
        }));
      });
    } catch (error) {
      return sendJson(res, 400, { error: "JSON invalide" });
    }
    return;
  }

  // 5. OBTENIR MON PROFIL : GET /me
  if (pathname === "/me" && method === "GET") {
    const user = getUserFromSession(req);

    if (!user) {
      return sendJson(res, 401, { error: "Non connecté" });
    }

    return sendJson(res, 200, user);
  }

  // 6. DÉCONNEXION : POST /logout
  if (pathname === "/logout" && method === "POST") {
    const cookies = parseCookies(req);
    if (cookies.sessionId) {
      delete sessions[cookies.sessionId]; // Supprime la session de la mémoire vive
    }

    // Force l'expiration immédiate du cookie sur le navigateur client (Max-Age=0)
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Set-Cookie": "sessionId=; HttpOnly; Path=/; Max-Age=0"
    });

    return res.end(JSON.stringify({ message: "Déconnexion réussie" }));
  }

  // ==========================================
  // ROUTES DES PUBLICATIONS (POSTS)
  // ==========================================

  // 7. LIRE TOUTES LES PUBLICATIONS : GET /posts
  if (pathname === "/posts" && method === "GET") {
    const sql = `
      SELECT posts.id, posts.uuid, posts.title, posts.content, posts.category, posts.image_url, posts.created_at, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      ORDER BY posts.created_at DESC
    `;

    db.query(sql, (err, results) => {
      if (err) {
        return sendJson(res, 500, { error: "Erreur récupération posts" });
      }

      sendJson(res, 200, results);
    });
    return;
  }

  // 8. CRÉER UNE PUBLICATION : POST /posts (Avec décodage d'image base64)
  if (pathname === "/posts" && method === "POST") {
    const user = getUserFromSession(req);

    if (!user) {
      return sendJson(res, 401, { error: "Non autorisé" });
    }

    try {
      const { title, content, category, image } = await parseBody(req);

      if (!title || !content || !category) {
        return sendJson(res, 400, { error: "Tous les champs texte sont obligatoires" });
      }

      const postUuid = uuidv4();
      let imageUrl = null;

      // Logique de traitement d'image encodée en Base64
      if (image) {
        // Regex pour capturer l'extension et le contenu brut en base64
        const matches = image.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const ext = matches[1];
          const buffer = Buffer.from(matches[2], 'base64'); // Re-décodage en binaire brut
          const fileName = uuidv4() + '.' + (ext === 'jpeg' ? 'jpg' : ext); // Donne un nom unique
          const uploadDir = path.join(PUBLIC_DIR, 'uploads');
          
          // Crée le sous-dossier de stockage sur le disque dur s'il n'existe pas
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
          }
          
          // Enregistre le fichier physiquement sur le disque
          fs.writeFileSync(path.join(uploadDir, fileName), buffer);
          imageUrl = '/uploads/' + fileName; // Chemin à enregistrer en base
        }
      }

      // Enregistrement final en BDD
      db.query(
        "INSERT INTO posts (uuid, user_id, title, content, category, image_url) VALUES (?, ?, ?, ?, ?, ?)",
        [postUuid, user.id, title, content, category, imageUrl],
        (err) => {
          if (err) {
            console.error("Erreur SQL lors de l'insertion du post :", err);
            return sendJson(res, 500, { error: "Erreur création post" });
          }

          sendJson(res, 201, { message: "Post créé avec succès" });
        }
      );
    } catch (error) {
      return sendJson(res, 400, { error: "JSON invalide" });
    }
    return;
  }

  // 9. SUPPRIMER UNE PUBLICATION : DELETE /posts/:id (Sécurisé & Nettoyage disque)
  if (pathname.startsWith("/posts/") && method === "DELETE") {
    const user = getUserFromSession(req);

    if (!user) {
      return sendJson(res, 401, { error: "Non connecté" });
    }

    const postId = pathname.split("/")[2];

    // Récupère d'abord le post pour vérifier l'existence et l'autorisation
    db.query("SELECT * FROM posts WHERE id = ?", [postId], (err, results) => {
      if (err) {
        console.error("Erreur SELECT lors de la suppression du post :", err);
        return sendJson(res, 500, { error: "Erreur serveur" });
      }

      if (results.length === 0) {
        return sendJson(res, 404, { error: "Publication non trouvée" });
      }

      const post = results[0];

      // Vérification stricte : Seul l'auteur peut supprimer son post
      if (post.user_id !== user.id) {
        return sendJson(res, 403, { error: "Vous n'avez pas l'autorisation de supprimer cette publication" });
      }

      // Lancement de la requête de suppression
      db.query("DELETE FROM posts WHERE id = ?", [postId], (err2) => {
        if (err2) {
          console.error("Erreur DELETE lors de la suppression du post :", err2);
          return sendJson(res, 500, { error: "Erreur suppression publication" });
        }

        // Si le post supprimé contenait une image physique, on la nettoie du disque dur
        if (post.image_url) {
          const filePath = path.join(PUBLIC_DIR, post.image_url);
          fs.unlink(filePath, (errLink) => {
            if (errLink) console.error("Erreur suppression image disque :", errLink);
          });
        }

        sendJson(res, 200, { message: "Publication supprimée avec succès" });
      });
    });
    return;
  }

  // ==========================================
  // ROUTES DES COMMENTAIRES
  // ==========================================

  // 10. COMMENTER UNE PUBLICATION : POST /comments
  if (pathname === "/comments" && method === "POST") {
    const user = getUserFromSession(req);

    if (!user) {
      return sendJson(res, 401, { error: "Non autorisé" });
    }

    try {
      const { post_id, content } = await parseBody(req);

      if (!post_id || !content) {
        return sendJson(res, 400, { error: "Champs manquants" });
      }

      const commentUuid = uuidv4();

      // Insertion du commentaire
      db.query(
        "INSERT INTO comments (uuid, post_id, user_id, content) VALUES (?, ?, ?, ?)",
        [commentUuid, post_id, user.id, content],
        (err) => {
          if (err) {
            console.error("Comment insert error:", err);
            return sendJson(res, 500, { error: "Erreur ajout commentaire" });
          }

          sendJson(res, 201, { message: "Commentaire ajouté" });
        }
      );
    } catch (error) {
      return sendJson(res, 400, { error: "JSON invalide" });
    }
    return;
  }

  // 11. LIRE TOUS LES COMMENTAIRES D'UN POST : GET /comments/:postId
  if (pathname.startsWith("/comments/") && method === "GET") {
    const postId = pathname.split("/")[2];

    const sql = `
      SELECT comments.id, comments.content, comments.created_at, users.username
      FROM comments
      JOIN users ON comments.user_id = users.id
      WHERE comments.post_id = ?
      ORDER BY comments.created_at DESC
    `;

    db.query(sql, [postId], (err, results) => {
      if (err) {
        return sendJson(res, 500, { error: "Erreur récupération commentaires" });
      }

      sendJson(res, 200, results);
    });
    return;
  }

  // ==========================================
  // ROUTES DES LIKES & DISLIKES
  // ==========================================

  // 12. RÉAGIR (LIKE/DISLIKE) A UN POST : POST /likes (Upsert unique)
  if (pathname === "/likes" && method === "POST") {
    const user = getUserFromSession(req);

    if (!user) {
      return sendJson(res, 401, { error: "Non autorisé" });
    }

    try {
      const { post_id, type } = await parseBody(req);

      if (!post_id || !["like", "dislike"].includes(type)) {
        return sendJson(res, 400, { error: "Données invalides" });
      }

      // Upsert intelligent : insère un like, ou le met à jour si la clé composite (user_id, post_id) existe déjà
      const sql = `
        INSERT INTO likes (user_id, post_id, type)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE type = VALUES(type)
      `;

      db.query(sql, [user.id, post_id, type], (err) => {
        if (err) {
          return sendJson(res, 500, { error: "Erreur réaction" });
        }

        sendJson(res, 200, { message: "Réaction enregistrée" });
      });
    } catch (error) {
      return sendJson(res, 400, { error: "JSON invalide" });
    }
    return;
  }

  // 13. COMPTER LES LIKES ET DISLIKES D'UN POST : GET /likes/:postId
  if (pathname.startsWith("/likes/") && method === "GET") {
    const postId = pathname.split("/")[2];

    const sql = `
      SELECT
        SUM(CASE WHEN type = 'like' THEN 1 ELSE 0 END) AS likes,
        SUM(CASE WHEN type = 'dislike' THEN 1 ELSE 0 END) AS dislikes
      FROM likes
      WHERE post_id = ?
    `;

    db.query(sql, [postId], (err, results) => {
      if (err) {
        return sendJson(res, 500, { error: "Erreur récupération likes" });
      }

      sendJson(res, 200, results[0]);
    });
    return;
  }

  // 14. VÉRIFIER SI L'UTILISATEUR ACTUEL A DEJA LIKE CE POST : GET /user-like/:postId
  if (pathname.startsWith("/user-like/") && method === "GET") {
    const user = getUserFromSession(req);
    const postId = pathname.split("/")[2];

    if (!user) {
      return sendJson(res, 200, { liked: false }); // Faux par défaut si anonyme
    }

    const sql = "SELECT type FROM likes WHERE user_id = ? AND post_id = ? AND type = 'like'";
    db.query(sql, [user.id, postId], (err, results) => {
      if (err) {
        return sendJson(res, 500, { error: "Erreur vérification like" });
      }

      sendJson(res, 200, { liked: results.length > 0 });
    });
    return;
  }

  // Route fallback 404
  sendJson(res, 404, { error: "Route introuvable" });
});

// ==========================================
// GESTION DES ERREURS ET LANCEMENT SERVEUR
// ==========================================

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} déjà utilisé. Arrêtez le processus qui écoute sur ce port ou changez le PORT dans server.js.`);
    process.exit(1);
  }
  console.error("Erreur serveur non gérée :", err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Serveur lancé sur http://127.0.0.1:${PORT}`);
});