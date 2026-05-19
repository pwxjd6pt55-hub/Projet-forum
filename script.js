// ==========================================
// CONFIGURATION ET VARIABLES GLOBALES
// ==========================================

// Récupération des conteneurs HTML indispensables du DOM
const postsContainer = document.getElementById("postsContainer");
const postForm = document.getElementById("postForm");
const categoryFilter = document.getElementById("categoryFilter");

// Variables d'état de l'application
let allPosts = []; // Stocke tous les posts récupérés du serveur pour le filtrage côté client
let currentUser = null; // Stocke les informations de l'utilisateur actuellement connecté
let activeFilterType = "category"; // Type de filtre actif ("category", "my-posts", "liked-posts")

// ==========================================
// FONCTIONS UTILITAIRES
// ==========================================

/**
 * Génère un avatar en HTML (rond coloré avec initiale) basé sur le nom d'utilisateur.
 * Calcule un code couleur unique et stable à partir des lettres du pseudo.
 * @param {string} username - Pseudo de l'utilisateur.
 * @param {number} size - Taille en pixels du rond (par défaut 36px).
 */
function getAvatar(username, size = 36) {
  const firstLetter = username ? username.charAt(0).toUpperCase() : '?';
  
  // Algorithme de hachage simple basé sur les codes caractères pour générer une couleur stable
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Liste de superbes couleurs modernes en HSL/Hex
  const colors = ["#6366f1", "#a855f7", "#ec4899", "#f43f5e", "#10b981", "#14b8a6", "#f59e0b", "#3b82f6"];
  const colorIndex = Math.abs(hash) % colors.length;
  const bgColor = colors[colorIndex];
  const fontSize = size === 36 ? '1rem' : '0.75rem';
  
  // Renvoie le badge HTML formaté
  return `<div class="avatar" style="background-color: ${bgColor}; display: inline-flex; align-items: center; justify-content: center; width: ${size}px; height: ${size}px; border-radius: 50%; color: #fff; font-weight: bold; font-size: ${fontSize}; margin-right: 8px; border: 1.5px solid rgba(255,255,255,0.1); flex-shrink: 0;">${firstLetter}</div>`;
}

/**
 * Affiche une notification Toast premium et temporaire à l'écran.
 * @param {string} message - Le texte du message à afficher.
 * @param {string} type - Le type de notification ('success', 'error', 'info', 'warning').
 */
function showToast(message, type = "success") {
  // Récupération ou création du conteneur de toasts dans le DOM
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  // Création du toast
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  // Icône adaptée selon le type
  let icon = "🔔";
  if (type === "success") icon = "✅";
  else if (type === "error") icon = "❌";
  else if (type === "info") icon = "ℹ️";
  else if (type === "warning") icon = "⚠️";

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  // Ajout au conteneur
  container.appendChild(toast);

  // Suppression automatique après 4 secondes avec animation de sortie
  setTimeout(() => {
    toast.classList.add("fade-out");
    toast.addEventListener("animationend", () => {
      toast.remove();
    });
  }, 4000);
}

/**
 * Synchronise et met à jour l'état visuel actif de la navbar et de la sidebar.
 * @param {string} filterType - Le type de filtre actif ('category', 'my-posts', 'liked-posts').
 */
function updateActiveNavigation(filterType) {
  // Retire la classe 'active' de tous les onglets de la navbar supérieure
  const navLinks = document.querySelectorAll(".nav-links a");
  navLinks.forEach(link => link.classList.remove("active"));

  // Récupère les boutons de la barre latérale
  const sidebarButtons = document.querySelectorAll(".sidebar .btn.full");

  // Rétablir la classe secondaire par défaut sur les boutons de la sidebar
  sidebarButtons.forEach(btn => {
    btn.classList.remove("primary");
    btn.classList.add("secondary");
  });

  // Met en surbrillance l'onglet correspondant
  if (filterType === "category") {
    const selectedCategory = categoryFilter ? categoryFilter.value : "all";
    if (selectedCategory === "all") {
      document.getElementById("navHome")?.classList.add("active");
    }
  } else if (filterType === "my-posts") {
    document.getElementById("navMyPosts")?.classList.add("active");
    if (sidebarButtons[0]) {
      sidebarButtons[0].classList.add("primary");
      sidebarButtons[0].classList.remove("secondary");
    }
  } else if (filterType === "liked-posts") {
    document.getElementById("navLikedPosts")?.classList.add("active");
    if (sidebarButtons[1]) {
      sidebarButtons[1].classList.add("primary");
      sidebarButtons[1].classList.remove("secondary");
    }
  }
}

// ==========================================
// GESTION DU PROFIL ET AUTHENTIFICATION
// ==========================================

/**
 * Récupère les informations de l'utilisateur actuellement connecté depuis l'API /me.
 * Si connecté, met à jour l'interface (affiche le pseudo et le bouton déconnexion).
 */
async function getCurrentUser() {
  try {
    const res = await fetch("/me", { credentials: "include" }); // "include" permet d'envoyer le cookie de session
    if (res.ok) {
      currentUser = await res.json();
      console.log("Utilisateur connecté :", currentUser);
      
      const authButtons = document.getElementById("authButtons");
      const userSection = document.getElementById("userSection");
      const username = document.getElementById("username");
      
      // Bascule de l'interface en mode "Connecté"
      if (authButtons) authButtons.style.display = "none";
      if (userSection) userSection.style.display = "flex";
      if (username) username.textContent = currentUser.username;
    } else {
      // Pas de session active, bascule en mode "Non connecté"
      const authButtons = document.getElementById("authButtons");
      const userSection = document.getElementById("userSection");
      if (authButtons) authButtons.style.display = "flex";
      if (userSection) userSection.style.display = "none";
    }
  } catch (error) {
    console.error("Erreur récupération utilisateur connecté :", error);
  }
}

/**
 * Déconnecte l'utilisateur actuel via un appel POST à /logout.
 * Vide les états, efface les éléments de profil de l'UI et recharge les publications.
 */
async function logout() {
  try {
    const res = await fetch("/logout", {
      method: "POST",
      credentials: "include"
    });
    
    if (res.ok) {
      currentUser = null;
      
      const authButtons = document.getElementById("authButtons");
      const userSection = document.getElementById("userSection");
      if (authButtons) authButtons.style.display = "flex";
      if (userSection) userSection.style.display = "none";
      
      // Réinitialise les variables locales
      allPosts = [];
      const categoryFilter = document.getElementById("categoryFilter");
      if (categoryFilter) categoryFilter.value = "all";
      
      loadPosts(); // Recharge les publications de façon anonyme
      showToast("Déconnexion réussie", "success");
    } else {
      showToast("Erreur lors de la déconnexion", "error");
    }
  } catch (error) {
    console.error("Erreur déconnexion :", error);
    showToast("Erreur de connexion au serveur", "error");
  }
}

// ==========================================
// GESTION DES PUBLICATIONS (POSTS)
// ==========================================

/**
 * Récupère tous les posts enregistrés depuis le backend via GET /posts.
 * Remplit allPosts et appelle le moteur de rendu.
 */
async function loadPosts() {
  try {
    console.log('Chargement des publications...');
    const res = await fetch("/posts");
    
    if (!res.ok) {
      console.error('Erreur API lors de la récupération des posts:', res.status);
      return;
    }
    
    const posts = await res.json();
    allPosts = posts; // Enregistre en mémoire locale pour le filtrage
    renderPosts(posts); // Rendu à l'écran
  } catch (error) {
    console.error("Erreur chargement posts :", error);
  }
}

/**
 * Construit et injecte dynamiquement les cartes HTML de chaque publication dans le DOM.
 * @param {Array} posts - Tableau de posts à dessiner.
 */
async function renderPosts(posts) {
  postsContainer.innerHTML = ""; // Vide le conteneur actuel

  for (const post of posts) {
    // 1. Récupération asynchrone des Likes/Dislikes pour ce post
    const likesRes = await fetch(`/likes/${post.id}`);
    const likesData = await likesRes.json();

    // 2. Vérifie si l'utilisateur actuel a aimé ou non ce post
    let userLiked = false;
    if (currentUser) {
      const userLikeRes = await fetch(`/user-like/${post.id}`, { credentials: "include" });
      if (userLikeRes.ok) {
        const userLikeData = await userLikeRes.json();
        userLiked = userLikeData.liked;
      }
    }

    // 3. Crée le composant article du post
    const card = document.createElement("article");
    card.className = "post-card";
    card.setAttribute("data-category", post.category);
    card.setAttribute("data-author", post.username);
    card.setAttribute("data-liked", userLiked);

    // 4. Génère le bouton de suppression uniquement pour le propriétaire du post
    const isAuthor = currentUser && currentUser.username === post.username;
    const deleteBtnHtml = isAuthor ? `<button class="delete-post-btn" data-post-id="${post.id}" style="background: none; border: none; color: #ff5e5e; cursor: pointer; font-size: 1.1rem; padding: 5px; margin-left: 10px; display: inline-flex; align-items: center; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'" title="Supprimer la publication">🗑️</button>` : '';

    // 5. Injecte la structure HTML complète de la carte
    card.innerHTML = `
      <div class="post-header" style="display: flex; align-items: flex-start; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 10px;">
          ${getAvatar(post.username, 40)}
          <div>
            <h3 style="margin: 0; font-size: 1.25rem; font-weight: 600;">${post.title}</h3>
            <p class="post-meta" style="margin: 3px 0 0 0;">Publié par <strong>${post.username}</strong> • ${new Date(post.created_at).toLocaleDateString('fr-FR')}</p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="category">${post.category}</span>
          ${deleteBtnHtml}
        </div>
      </div>
      <p class="post-text">${post.content}</p>
      ${post.image_url ? `<div class="post-image-container"><img src="${post.image_url}" class="post-image" alt="Image de publication" style="max-width: 100%; border-radius: 8px; margin: 15px 0; max-height: 400px; object-fit: contain; background: rgba(0,0,0,0.2); display: block;" /></div>` : ''}
      <div class="post-actions">
        <button class="like-btn" data-post-id="${post.id}">👍 <span>${likesData.likes || 0}</span></button>
        <button class="dislike-btn" data-post-id="${post.id}">👎 <span>${likesData.dislikes || 0}</span></button>
        <button class="comment-toggle" data-post-id="${post.id}">💬 Commentaires (<span>0</span>)</button>
      </div>
      <div class="comments hidden" data-post-id="${post.id}">
        <div id="comments-list-${post.id}" style="margin-bottom: 15px;"></div>
        <form class="comment-form" data-post-id="${post.id}">
          <input type="text" placeholder="Ajouter un commentaire..." required />
          <button type="submit" class="btn secondary">Envoyer</button>
        </form>
      </div>
    `;

    postsContainer.appendChild(card);
    loadComments(post.id); // Charge asynchronement les commentaires et actualise le compteur
  }
}

/**
 * Filtre les posts affichés à l'écran en combinant l'onglet actif et le mot-clé de recherche.
 * @param {string} type - Nouveau type de filtre à appliquer (facultatif).
 */
function filterPosts(type) {
  if (type) {
    activeFilterType = type; // Met à jour le type de filtre global si spécifié
  }

  // Synchronise visuellement les onglets de la navbar et de la sidebar
  updateActiveNavigation(activeFilterType);

  const query = document.getElementById("searchInput")?.value.toLowerCase() || "";
  const postCards = postsContainer.querySelectorAll('.post-card');
  let visibleCount = 0;

  postCards.forEach(card => {
    let shouldShow = true;

    // 1. Première passe : Filtrage selon l'onglet ou sélecteur latéral
    if (activeFilterType === "category") {
      const selectedCategory = categoryFilter.value;
      const category = card.getAttribute('data-category');
      shouldShow = selectedCategory === 'all' || category === selectedCategory;
    } else if (activeFilterType === "my-posts") {
      if (!currentUser) {
        shouldShow = false;
      } else {
        const author = card.getAttribute('data-author');
        shouldShow = author === currentUser.username;
      }
    } else if (activeFilterType === "liked-posts") {
      if (!currentUser) {
        shouldShow = false;
      } else {
        const liked = card.getAttribute('data-liked') === 'true';
        shouldShow = liked;
      }
    }

    // 2. Deuxième passe : Recherche textuelle cumulative
    if (shouldShow && query) {
      const title = card.querySelector('h3').textContent.toLowerCase();
      const content = card.querySelector('.post-text').textContent.toLowerCase();
      shouldShow = title.includes(query) || content.includes(query);
    }

    if (shouldShow) visibleCount++;

    // Application du style d'affichage
    card.style.display = shouldShow ? 'block' : 'none';
  });

  // Gestion de l'état vide (Empty State)
  const noResultsState = document.getElementById("noResultsState");
  if (noResultsState) {
    if (visibleCount === 0) {
      noResultsState.classList.remove("hidden");
    } else {
      noResultsState.classList.add("hidden");
    }
  }
}

/**
 * Envoie une réaction de Like/Dislike au serveur.
 * @param {number} postId - ID de la publication.
 * @param {string} type - Type de réaction ('like' ou 'dislike').
 */
async function reactPost(postId, type) {
  try {
    const res = await fetch("/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ post_id: postId, type })
    });

    const data = await res.json();

    if (res.ok) {
      loadPosts(); // Recharge tous les posts pour rafraîchir les nombres globaux
    } else {
      showToast(data.error || "Erreur lors de la réaction", "error");
    }
  } catch (error) {
    console.error("Erreur réaction :", error);
    showToast("Erreur de connexion au serveur", "error");
  }
}

/**
 * Supprime physiquement une publication via l'API DELETE /posts/:id.
 * Appelé uniquement par l'auteur après confirmation.
 * @param {number} postId - ID de la publication.
 */
async function deletePost(postId) {
  try {
    const res = await fetch(`/posts/${postId}`, {
      method: "DELETE",
      credentials: "include"
    });
    
    const result = await res.json();
    if (res.ok) {
      showToast("Publication supprimée avec succès !", "success");
      loadPosts(); // Recharge le flux d'actualités après suppression
    } else {
      showToast(result.error || "Erreur lors de la suppression de la publication", "error");
    }
  } catch (error) {
    console.error("Erreur suppression post:", error);
    showToast("Erreur de connexion au serveur", "error");
  }
}

// ==========================================
// GESTION DES COMMENTAIRES
// ==========================================

/**
 * Envoie un nouveau commentaire au serveur pour une publication donnée.
 * @param {number} postId - ID de la publication.
 * @param {string} content - Contenu textuel du commentaire.
 */
async function addComment(postId, content) {
  try {
    const res = await fetch("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ post_id: postId, content })
    });

    const data = await res.json();
    if (res.ok) {
      showToast("Commentaire ajouté !", "success");
      loadComments(postId); // Recharge uniquement la liste des commentaires de ce post
    } else {
      showToast(data.error || "Erreur lors de l'ajout du commentaire", "error");
    }
  } catch (error) {
    console.error("Erreur ajout commentaire:", error);
    showToast("Erreur de connexion au serveur", "error");
  }
}

/**
 * Charge tous les commentaires d'une publication, met à jour le compteur dynamique et affiche la liste.
 * @param {number} postId - ID de la publication.
 */
async function loadComments(postId) {
  try {
    const res = await fetch(`/comments/${postId}`);
    const comments = await res.json();

    // Récupère et met à jour le compteur de commentaires sur le bouton d'action
    const commentCountSpan = document.querySelector(`.comment-toggle[data-post-id="${postId}"] span`);
    if (commentCountSpan) {
      commentCountSpan.textContent = comments.length;
    }

    // Récupère le conteneur de liste HTML
    const container = document.getElementById(`comments-list-${postId}`);
    if (container) {
      if (comments.length === 0) {
        container.innerHTML = `<p style="color: #666; font-size: 0.9rem; font-style: italic; margin: 10px 0;">Aucun commentaire pour le moment.</p>`;
        return;
      }
      
      // Injecte le code HTML de chaque commentaire avec son avatar
      container.innerHTML = comments.map(c => `
        <div class="comment" style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 10px; background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 8px;">
          ${getAvatar(c.username, 28)}
          <div style="flex-grow: 1;">
            <div style="font-size: 0.85rem; color: #aaa; margin-bottom: 2px;">
              <strong>${c.username}</strong> • ${new Date(c.created_at || Date.now()).toLocaleDateString('fr-FR')}
            </div>
            <div style="color: #fff; font-size: 0.95rem; line-height: 1.4;">${c.content}</div>
          </div>
        </div>
      `).join("");
    }
  } catch (error) {
    console.error("Erreur chargement commentaires:", error);
  }
}

// ==========================================
// INITIALISATION DE L'APPLICATION ET LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialise l'identité utilisateur de la session
  await getCurrentUser();
  
  // 2. Charge les publications
  loadPosts();

  // 3. Liaison du filtre de catégorie (dropdown principal)
  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => filterPosts("category"));
  }

  // 4. Liaison de la barre de recherche textuelle
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => filterPosts());
  }

  // 5. Liaison des filtres spéciaux (Navbar supérieure et Sidebar latérale)

  // Onglet "Accueil" dans la Navbar supérieure
  const navHome = document.getElementById("navHome");
  if (navHome) {
    navHome.addEventListener("click", (e) => {
      e.preventDefault();
      if (categoryFilter) categoryFilter.value = "all";
      const searchInput = document.getElementById("searchInput");
      if (searchInput) searchInput.value = "";
      filterPosts("category");
    });
  }

  // Onglet "Mes posts" dans la Navbar supérieure
  const navMyPosts = document.getElementById("navMyPosts");
  if (navMyPosts) {
    navMyPosts.addEventListener("click", (e) => {
      e.preventDefault();
      if (currentUser) {
        filterPosts("my-posts");
      } else {
        showToast("Vous devez être connecté pour voir vos publications", "error");
      }
    });
  }

  // Onglet "Posts aimés" dans la Navbar supérieure
  const navLikedPosts = document.getElementById("navLikedPosts");
  if (navLikedPosts) {
    navLikedPosts.addEventListener("click", (e) => {
      e.preventDefault();
      if (currentUser) {
        filterPosts("liked-posts");
      } else {
        showToast("Vous devez être connecté pour voir vos publications aimées", "error");
      }
    });
  }

  // Boutons correspondants dans la barre latérale (Sidebar)
  const filterButtons = document.querySelectorAll('.sidebar .btn.full');
  if (filterButtons.length >= 2) {
    filterButtons[0].addEventListener('click', () => {
      if (currentUser) {
        filterPosts("my-posts");
      } else {
        showToast("Vous devez être connecté pour voir vos publications", "error");
      }
    });
    
    filterButtons[1].addEventListener('click', () => {
      if (currentUser) {
        filterPosts("liked-posts");
      } else {
        showToast("Vous devez être connecté pour voir vos publications aimées", "error");
      }
    });
  }

  // Bouton de réinitialisation de l'état vide (Empty State)
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      if (categoryFilter) categoryFilter.value = "all";
      const searchInput = document.getElementById("searchInput");
      if (searchInput) searchInput.value = "";
      filterPosts("category");
    });
  }

  // 6. Bouton de déconnexion
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  // 7. Aperçu dynamique de l'image sélectionnée
  const postImageInput = document.getElementById("postImage");
  const imagePreview = document.getElementById("imagePreview");
  
  if (postImageInput && imagePreview) {
    postImageInput.addEventListener("change", function() {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
          imagePreview.src = e.target.result;
          imagePreview.style.display = "block"; // Affiche l'aperçu
        }
        reader.readAsDataURL(file);
      } else {
        imagePreview.src = "";
        imagePreview.style.display = "none";
      }
    });
  }

  // 8. Envoi du formulaire de création de post (avec conversion d'image optionnelle)
  if (postForm) {
    postForm.addEventListener("submit", async (e) => {
      e.preventDefault(); // Bloque le rechargement de page par défaut

      const imageFile = document.getElementById("postImage").files[0];
      let imageBase64 = null;

      // Si une image a été sélectionnée, on attend sa conversion en Base64
      if (imageFile) {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        await new Promise((resolve) => {
          reader.onload = () => {
            imageBase64 = reader.result;
            resolve();
          };
        });
      }

      // Structure les données à envoyer
      const data = {
        title: document.getElementById("postTitle").value,
        content: document.getElementById("postContent").value,
        category: document.getElementById("postCategory").value,
        image: imageBase64
      };

      try {
        const res = await fetch("/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data)
        });

        const result = await res.json();
        if (res.ok) {
          showToast("Votre publication a été créée !", "success");
          postForm.reset(); // Vide le formulaire
          if (imagePreview) {
            imagePreview.src = "";
            imagePreview.style.display = "none"; // Cache l'aperçu d'image
          }
          loadPosts(); // Rafraîchit les posts
        } else {
          showToast(result.error || "Erreur lors de la création du post", "error");
        }
      } catch (error) {
        console.error("Erreur soumission formulaire post :", error);
      }
    });
  }

  // 9. Délégation globale d'événements pour les boutons créés dynamiquement
  postsContainer.addEventListener('click', (e) => {
    const likeBtn = e.target.closest('.like-btn');
    const dislikeBtn = e.target.closest('.dislike-btn');
    const commentToggle = e.target.closest('.comment-toggle');
    const deleteBtn = e.target.closest('.delete-post-btn');

    if (likeBtn) {
      const postId = likeBtn.getAttribute('data-post-id');
      reactPost(postId, 'like');
    } else if (dislikeBtn) {
      const postId = dislikeBtn.getAttribute('data-post-id');
      reactPost(postId, 'dislike');
    } else if (commentToggle) {
      const postId = commentToggle.getAttribute('data-post-id');
      const commentsDiv = document.querySelector(`.comments[data-post-id="${postId}"]`);
      if (commentsDiv) {
        commentsDiv.classList.toggle('hidden'); // Affiche/masque les commentaires
      }
    } else if (deleteBtn) {
      const postId = deleteBtn.getAttribute('data-post-id');
      if (confirm("Voulez-vous vraiment supprimer cette publication ?")) {
        deletePost(postId);
      }
    }
  });

  // 10. Soumission de formulaire de commentaire
  postsContainer.addEventListener('submit', (e) => {
    if (e.target.classList.contains('comment-form')) {
      e.preventDefault();
      const postId = e.target.getAttribute('data-post-id');
      const input = e.target.querySelector('input');
      const content = input.value.trim();
      if (content) {
        addComment(postId, content);
        input.value = ''; // Vide le champ texte
      }
    }
  });
});