import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const api = axios.create({ baseURL: API_URL });

export const Teams = {
  list: () => api.get('/teams').then(r => r.data),
  get: (id) => api.get(`/teams/${id}`).then(r => r.data),
  create: (data) => api.post('/teams', data).then(r => r.data),
  update: (id, data) => api.put(`/teams/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/teams/${id}`),
};

export const Players = {
  list: (team_id) => api.get('/players', { params: { team_id } }).then(r => r.data),
  listAll: () => api.get('/players/all/with-teams').then(r => r.data),
  stats: (id) => api.get(`/players/${id}/stats`).then(r => r.data),
  create: (data) => api.post('/players', data).then(r => r.data),
  update: (id, data) => api.put(`/players/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/players/${id}`),
};

export const Matches = {
  list: () => api.get('/matches').then(r => r.data),
  get: (id) => api.get(`/matches/${id}`).then(r => r.data),
  create: (data) => api.post('/matches', data).then(r => r.data),
  setToss: (id, data) => api.post(`/matches/${id}/toss`, data).then(r => r.data),
  startSecondInnings: (id) => api.post(`/matches/${id}/second-innings`).then(r => r.data),
  remove: (id) => api.delete(`/matches/${id}`),
};

export const Innings = {
  scoreboard: (id) => api.get(`/innings/${id}/scoreboard`).then(r => r.data),
  setBatsmen: (id, data) => api.post(`/innings/${id}/set-batsmen`, data).then(r => r.data),
  swapStrike: (id) => api.post(`/innings/${id}/swap-batsmen`).then(r => r.data),
  setBowler: (id, data) => api.post(`/innings/${id}/set-bowler`, data).then(r => r.data),
  ball: (id, data) => api.post(`/innings/${id}/ball`, data).then(r => r.data),
  undo: (id) => api.post(`/innings/${id}/undo`).then(r => r.data),
};

export const Records = {
  get: () => api.get('/records').then(r => r.data),
};

export default api;
