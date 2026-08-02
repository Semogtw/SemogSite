INSERT OR IGNORE INTO projects (
  id, slug, name, icon, status, health, priority, progress_estimate,
  focus, next_action, branch_summary, status_basis, confidence, visibility,
  public_summary, private_summary, public_progress, featured, cover_asset_id,
  live_url, documentation_url, last_activity_at, last_synced_at, manual_lock,
  data_source, created_at, updated_at
) VALUES (
  'demo-project-platform',
  'semogtw-platform-demo',
  'Semogtw Platform — demonstração',
  NULL,
  'active',
  'unknown',
  'medium',
  10,
  'Exercitar os componentes da fundação sem representar estado real.',
  'Substituir este registro pelo snapshot migrado e revalidado.',
  NULL,
  'Registro fictício criado apenas para desenvolvimento.',
  'low',
  'private',
  NULL,
  'Este conteúdo é demonstrativo e não representa migração do Notion ou sincronização do GitHub.',
  NULL,
  0,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  1,
  'seed_demo',
  '2026-08-01T00:00:00.000Z',
  '2026-08-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO workstreams (
  id, project_id, title, status, priority, branch, current_delivery,
  next_gate, tests_summary, evidence_summary, last_signal_at, data_source,
  created_at, updated_at
) VALUES (
  'demo-workstream-foundation',
  'demo-project-platform',
  'Fundação demonstrativa',
  'active',
  'medium',
  NULL,
  'Validar modelo relacional local.',
  'Executar testes automatizados em ambiente com dependências instaladas.',
  'Gate ainda não executado no seed.',
  '',
  NULL,
  'seed_demo',
  '2026-08-01T00:00:00.000Z',
  '2026-08-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO stages (
  id, project_id, workstream_id, order_index, title, area, state, progress,
  planned_result, current_position, next_step, blocker, evidence_summary,
  done, manual_lock, updated_from, created_at, updated_at
) VALUES (
  'demo-stage-database',
  'demo-project-platform',
  'demo-workstream-foundation',
  1,
  'Validar persistência demonstrativa',
  'validation',
  'in_progress',
  10,
  'Schema criado e validado sem dados reais.',
  'Migration e seed demonstrativo preparados.',
  'Executar contrato do repositório em ambiente com SQLite e Vitest.',
  NULL,
  NULL,
  0,
  1,
  'seed_demo',
  '2026-08-01T00:00:00.000Z',
  '2026-08-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO app_settings (key, value_json, updated_at) VALUES
  ('timezone', '"America/Bahia"', '2026-08-01T00:00:00.000Z'),
  ('schema_version', '1', '2026-08-01T00:00:00.000Z'),
  ('seed_notice', '"Dados demonstrativos; nenhuma migração foi concluída."', '2026-08-01T00:00:00.000Z');
