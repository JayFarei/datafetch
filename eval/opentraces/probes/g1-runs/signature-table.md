| session | family | params | records | calls | intent signature | shape hash |
|---|---|---|---:|---:|---|---|
| p1_t1_01 | P1-T1 | `{"group_by":"model","window":{"end":"2026-05-02T00:00:00Z","label":"April 26 through May 1, 2026","start":"2026-04-26T00:00:00Z"}}` | 1592 | 1 | `db` | `1fd210b3` |
| p1_t1_02 | P1-T1 | `{"group_by":"project","window":{"end":"2026-06-01T00:00:00Z","label":"May 2026","start":"2026-05-01T00:00:00Z"}}` | 1592 | 1 | `db` | `1fd210b3` |
| p1_t1_03 | P1-T1 | `{"group_by":"day","window":{"end":"2026-05-24T00:00:00Z","label":"the week of May 17, 2026","start":"2026-05-17T00:00:00Z"}}` | 1592 | 1 | `db` | `1fd210b3` |
| p3_t2_01 | P3-T2 | `{"project":"2026-03-27-community-traces-hf-24eb286b"}` | 1592 | 1 | `db` | `b577b96a` |
| p3_t2_02 | P3-T2 | `{"project":"project-24eb286b"}` | 1592 | 1 | `db` | `b577b96a` |
| p3_t2_03 | P3-T2 | `{"project":"project-76420f2c"}` | 1592 | 1 | `db` | `b577b96a` |
| p4_t1_01 | P4-T1 | `{"commit":"05ecab6e9564a2a9d07b0ef8b190f12188284401"}` | 4141 | 2 | `FANOUT(db)` | `8ffc245b` |
| p4_t1_02 | P4-T1 | `{"commit":"067599b03f0bfcd8ac9650b18aa7511c7299641a"}` | 4141 | 2 | `FANOUT(db)` | `8ffc245b` |
| p4_t1_03 | P4-T1 | `{"commit":"1126d01f2de6067feec1128e76be283cbeae40be"}` | 4141 | 2 | `FANOUT(db)` | `8ffc245b` |
