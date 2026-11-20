// Garante o padrão Conventional Commits: tipo(escopo): descrição
// Ex.: feat(auth): adiciona refresh token rotativo
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Mensagens em português usam acentos e letras maiúsculas em siglas.
    'subject-case': [0],
    'body-max-line-length': [0],
  },
};
