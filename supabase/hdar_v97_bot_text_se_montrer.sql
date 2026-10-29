-- hdar v97 — Message d'accueil du robot : « Se montrer » / « Se cacher » au lieu de « qui est dispo ».
-- Ne modifie que la ligne « La carte » du texte actuel (le reste, modifiable dans l'admin, est conservé).
update hdar.bot_settings
set dm_text = replace(dm_text,
  'vois qui est dispo autour de toi, en restant discret (ta position est toujours approximative).',
  'touche « Se montrer » pour apparaître (1 h, 3 h ou toute la nuit) et vois qui est visible autour de toi. « Se cacher » à tout moment, ta position reste approximative.'),
  updated_at = now()
where dm_text like '%vois qui est dispo autour de toi%';
