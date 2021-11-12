'use strict';
const request = require('supertest');//17章 supertest の読み込み
const assert = require('assert');// 20章Node.js の assert モジュール を読み込み
const app = require('../app');//17章 テストの対象となる app.js の読み込み
const passportStub = require('passport-stub');//17章 passport-stub モジュールの読み込み
const User = require('../models/user');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const Availability = require('../models/availability');//20章 出欠のモデルの読み込み
const Comment = require('../models/comment');
const deleteScheduleAggregate = require('../routes/schedules').deleteScheduleAggregate;


describe('/login', () => {//login にアクセスした際
  beforeAll(() => {//17章 テスト前に実行したい処理をこの中に記述
    passportStub.install(app);//passportStub を app オブジェクトにインストール
    passportStub.login({ username: 'testuser' });//testuser としてログイン
  });

  afterAll(() => {//17章 テスト後に実行したい処理をこの中に記述
    passportStub.logout();//testuser からログアウト
    passportStub.uninstall(app);////passportStub をアンインストール
  });

  test('ログインのためのリンクが含まれる', () => {
    return request(app)//17章 supertest のテストの記法
      .get('/login')//login への GET リクエストを作成 
      .expect('Content-Type', 'text/html; charset=utf-8')//レスポンスヘッダの 'Content-Type' が text/html; charset=utf-8 である
      .expect(/<a href="\/auth\/github"/)//<a href="/auth/github" が HTML に含まれる
      .expect(200);//ステータスコードが 200 OK で返る
  });

  test('ログイン時はユーザー名が表示される', () => {
    return request(app)
      .get('/login')
      .expect(/testuser/)
      .expect(200);
  });
});

describe('/logout', () => {//logout にアクセスした際
  test('/ にリダイレクトされる', () => {
    return request(app)
      .get('/logout')//logout への GET リクエストを作成 
      .expect('Location', '/')// "/"への302リダイレクト1
      .expect(302);// "/"への302リダイレクト2
  });
});

//19章「予定が作成でき、表示される」ことをテスト ここから
describe('/schedules', () => {
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(() => {
    passportStub.logout();
    passportStub.uninstall(app);
  });

  test('予定が作成でき、表示される', (done) => {
    User.upsert({ userId: 0, username: 'testuser' }).then(() => {
      // userId が 0 で username がtestuserの ユーザーをデータベース上に作成
      request(app)
        .post('/schedules')//POST メソッドを使い予定と候補を作成
        .send({ scheduleName: 'テスト予定1', memo: 'テストメモ1\r\nテストメモ2', candidates: 'テスト候補1\r\nテスト候補2\r\nテスト候補3' })
        .expect('Location', /schedules/)//リダイレクト
        .expect(302)//リダイレクト
        .end((err, res) => {
          const createdSchedulePath = res.headers.location;
          request(app)
            .get(createdSchedulePath)
            .expect(/テスト予定1/)
            .expect(/テストメモ1/)
            .expect(/テストメモ2/)
            .expect(/テスト候補1/)
            .expect(/テスト候補2/)
            .expect(/テスト候補3/)
            .expect(200)
            .end((err, res) => { deleteScheduleAggregate(createdSchedulePath.split('/schedules/')[1], done, err); });
            //20章 deleteScheduleAggregate という関数に 予定、そこに紐づく出欠・候補を削除するためのメソッドを切り出し
        });
    });
  });
});
//19章「予定が作成でき、表示される」ことをテスト ここまで

//20章 出欠更新のテストの実装　ここから
describe('/schedules/:scheduleId/users/:userId/candidates/:candidateId', () => {
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(() => {
    passportStub.logout();
    passportStub.uninstall(app);
  });

  test('出欠が更新できる', (done) => {
    User.upsert({ userId: 0, username: 'testuser' }).then(() => {
      request(app)
        .post('/schedules')///schedules に POST を行い「予定」と「候補」を作成
        .send({ scheduleName: 'テスト出欠更新予定1', memo: 'テスト出欠更新メモ1', candidates: 'テスト出欠更新候補1' })
        .end((err, res) => {
          const createdSchedulePath = res.headers.location;
          const scheduleId = createdSchedulePath.split('/schedules/')[1];
          Candidate.findOne({
            where: { scheduleId: scheduleId }
          }).then((candidate) => {
            //予定」に関連する候補を取得し、 その「候補」に対して、 POST で Web API に対して欠席を出席に更新
            // 更新がされることをテスト
            const userId = 0;
            request(app)
              .post(`/schedules/${scheduleId}/users/${userId}/candidates/${candidate.candidateId}`)
              .send({ availability: 2 }) // 出席に更新
              .expect('{"status":"OK","availability":2}')//リクエストのレスポンスに '{"status":"OK","availability":2}' が 含まれるかどうかをテスト
              .end((err, res) => {
                Availability.findAll({
                  //Availability.findAll 関数
                  //データベースから where で条件を指定した全ての出欠を取得
                  where: { scheduleId: scheduleId }
                }).then((availabilities) => {
                  //then 関数を呼び出すことで、引数 availabilities 
                  //出欠モデル models/availability.js で定義したモデルの配列が渡され
                  assert.strictEqual(availabilities.length, 1);//availabilities の配列の長さは1
                  assert.strictEqual(availabilities[0].availability, 2);//availabilities の1番目の配列の値は2
                  deleteScheduleAggregate(scheduleId, done, err);
                });
              });
          });
        });
    });
  });
});
//20章 出欠更新のテストの実装　ここまで

describe('/schedules/:scheduleId/users/:userId/comments', () => {
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(() => {
    passportStub.logout();
    passportStub.uninstall(app);
  });

  test('コメントが更新できる', (done) => {
    User.upsert({ userId: 0, username: 'testuser' }).then(() => {
      request(app)
        .post('/schedules')
        .send({ scheduleName: 'テストコメント更新予定1', memo: 'テストコメント更新メモ1', candidates: 'テストコメント更新候補1' })
        .end((err, res) => {
          const createdSchedulePath = res.headers.location;
          const scheduleId = createdSchedulePath.split('/schedules/')[1];
          // 更新がされることをテスト
          const userId = 0;
          request(app)
            .post(`/schedules/${scheduleId}/users/${userId}/comments`)
            .send({ comment: 'testcomment' })
            .expect('{"status":"OK","comment":"testcomment"}')
            .end((err, res) => {
              Comment.findAll({
                where: { scheduleId: scheduleId }
              }).then((comments) => {
                assert.strictEqual(comments.length, 1);
                assert.strictEqual(comments[0].comment, 'testcomment');
                deleteScheduleAggregate(scheduleId, done, err);
              });
            });
        });
    });
  });
});


describe('/schedules/:scheduleId?edit=1', () => {
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(() => {
    passportStub.logout();
    passportStub.uninstall(app);
  });

  test('予定が更新でき、候補が追加できる', (done) => {
    User.upsert({ userId: 0, username: 'testuser' }).then(() => {
      request(app)
        .post('/schedules')
        .send({ scheduleName: 'テスト更新予定1', memo: 'テスト更新メモ1', candidates: 'テスト更新候補1' })
        .end((err, res) => {
          const createdSchedulePath = res.headers.location;
          const scheduleId = createdSchedulePath.split('/schedules/')[1];
          // 更新がされることをテスト
          request(app)
            .post(`/schedules/${scheduleId}?edit=1`)
            .send({ scheduleName: 'テスト更新予定2', memo: 'テスト更新メモ2', candidates: 'テスト更新候補2' })
            .end((err, res) => {
              Schedule.findByPk(scheduleId).then((s) => {
                assert.strictEqual(s.scheduleName, 'テスト更新予定2');
                assert.strictEqual(s.memo, 'テスト更新メモ2');
              });
              Candidate.findAll({
                where: { scheduleId: scheduleId },
                order: [['candidateId', 'ASC']]
              }).then((candidates) => {
                assert.strictEqual(candidates.length, 2);
                assert.strictEqual(candidates[0].candidateName, 'テスト更新候補1');
                assert.strictEqual(candidates[1].candidateName, 'テスト更新候補2');
                deleteScheduleAggregate(scheduleId, done, err);
              });
            });
        });
    });
  });
});

describe('/schedules/:scheduleId?delete=1', () => {
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(() => {
    passportStub.logout();
    passportStub.uninstall(app);
  });

  test('予定に関連する全ての情報が削除できる', (done) => {
    User.upsert({ userId: 0, username: 'testuser' }).then(() => {
      request(app)
        .post('/schedules')
        .send({ scheduleName: 'テスト更新予定1', memo: 'テスト更新メモ1', candidates: 'テスト更新候補1' })
        .end((err, res) => {
          const createdSchedulePath = res.headers.location;
          const scheduleId = createdSchedulePath.split('/schedules/')[1];

          // 出欠作成
          const promiseAvailability = Candidate.findOne({
            where: { scheduleId: scheduleId }
          }).then((candidate) => {
            return new Promise((resolve) => {
              const userId = 0;
              request(app)
                .post(`/schedules/${scheduleId}/users/${userId}/candidates/${candidate.candidateId}`)
                .send({ availability: 2 }) // 出席に更新
                .end((err, res) => {
                  if (err) done(err);
                  resolve();
                });
            });
          });

          // コメント作成
          const promiseComment = new Promise((resolve) => {
            const userId = 0;
            request(app)
              .post(`/schedules/${scheduleId}/users/${userId}/comments`)
              .send({ comment: 'testcomment' })
              .expect('{"status":"OK","comment":"testcomment"}')
              .end((err, res) => {
                if (err) done(err);
                resolve();
              });
          });

          // 削除
          const promiseDeleted = Promise.all([promiseAvailability, promiseComment]).then(() => {
            return new Promise((resolve) => {
              request(app)
                .post(`/schedules/${scheduleId}?delete=1`)
                .end((err, res) => {
                  if (err) done(err);
                  resolve();
                });
            });
          });

          // テスト
          promiseDeleted.then(() => {
            const p1 = Comment.findAll({
              where: { scheduleId: scheduleId }
            }).then((comments) => {
              assert.strictEqual(comments.length, 0);
            });
            const p2 = Availability.findAll({
              where: { scheduleId: scheduleId }
            }).then((availabilities) => {
              assert.strictEqual(availabilities.length, 0);
            });
            const p3 = Candidate.findAll({
              where: { scheduleId: scheduleId }
            }).then((candidates) => {
              assert.strictEqual(candidates.length, 0);
            });
            const p4 = Schedule.findByPk(scheduleId).then((schedule) => {
              assert.strictEqual(!schedule, true);
            });
            Promise.all([p1, p2, p3, p4]).then(() => {
              if (err) return done(err);
              done();
            });
          });
        });
    });
  });
});