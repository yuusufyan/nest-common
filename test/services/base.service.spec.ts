import { BaseService } from '../../src/services/base.service';

// Minimal fake TypeORM metadata shape -- just enough of the real
// EntityMetadata surface that BaseService.findAll reads from.
function makeMetadata() {
  return {
    tableName: 'test_entity',
    deleteDateColumn: undefined,
    columns: [
      { propertyName: 'id', databaseName: 'id', type: 'int' },
      { propertyName: 'name', databaseName: 'name', type: 'varchar' },
    ],
    relations: [
      {
        propertyName: 'division',
        inverseEntityMetadata: {
          columns: [
            { propertyName: 'id', databaseName: 'id', type: 'int' },
            { propertyName: 'name', databaseName: 'name', type: 'varchar' },
          ],
        },
      },
    ],
  };
}

// Chainable fake query builder that records every .orderBy() call instead
// of touching a real database -- lets the tests assert exactly what SQL
// fragment would have been generated, without needing Postgres/sqlite.
function makeQueryBuilder(alias: string) {
  const qb: any = {
    alias,
    orderByCalls: [] as Array<[string, string]>,
    leftJoinAndSelect: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn((col: string, dir: string) => {
      qb.orderByCalls.push([col, dir]);
      return qb;
    }),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn(async () => [[], 0]),
  };
  return qb;
}

function makeService() {
  const metadata = makeMetadata();
  const repo: any = {
    metadata,
    createQueryBuilder: jest.fn((alias: string) => makeQueryBuilder(alias)),
  };
  class TestService extends BaseService<any> {}
  const service = new TestService(repo);
  return { service, repo };
}

describe('BaseService.findAll sortBy handling', () => {
  describe('security: relation-qualified sortBy (dot path)', () => {
    it('rejects the exact injection shape from the audit (entity.id + raw pg_sleep) without ever calling orderBy with it', async () => {
      const { service, repo } = makeService();
      const malicious = 'entity.id, (select pg_sleep(5))';

      await service.findAll({ page: 1, limit: 10, sortBy: malicious } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).not.toHaveBeenCalled();
      // Belt-and-suspenders: the raw malicious string must never appear as
      // any argument ever passed to orderBy.
      for (const call of qb.orderBy.mock.calls) {
        expect(call[0]).not.toContain('pg_sleep');
      }
    });

    it('rejects a real relation name with an appended raw SQL fragment', async () => {
      const { service, repo } = makeService();
      const malicious = 'division.id, (select pg_sleep(5))';

      await service.findAll({ page: 1, limit: 10, sortBy: malicious } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).not.toHaveBeenCalled();
    });

    it('rejects a syntactically-invalid dotted value (parens/semicolons/spaces)', async () => {
      const { service, repo } = makeService();
      const malicious = "division.id); drop table x --";

      await service.findAll({ page: 1, limit: 10, sortBy: malicious } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).not.toHaveBeenCalled();
    });

    it('rejects a relation that does not exist on the entity', async () => {
      const { service, repo } = makeService();

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: 'not_a_relation.name',
      } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).not.toHaveBeenCalled();
    });

    it('rejects a real relation with a column that does not exist on its target entity', async () => {
      const { service, repo } = makeService();

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: 'division.not_a_real_column',
      } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).not.toHaveBeenCalled();
    });

    it('accepts a legitimate relation.column sortBy and produces the same orderBy shape as before the fix', async () => {
      const { service, repo } = makeService();

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: 'division.name',
        orderBy: 'DESC',
      } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).toHaveBeenCalledTimes(1);
      expect(qb.orderBy).toHaveBeenCalledWith('division.name', 'DESC');
    });

    it('defaults to ASC when orderBy direction is not supplied', async () => {
      const { service, repo } = makeService();

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: 'division.id',
      } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).toHaveBeenCalledWith('division.id', 'ASC');
    });
  });

  describe('flat column sortBy (no dot) -- unchanged behavior, covered for regression', () => {
    it('accepts a real column', async () => {
      const { service, repo } = makeService();

      await service.findAll({ page: 1, limit: 10, sortBy: 'name' } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).toHaveBeenCalledWith('entity.name', 'ASC');
    });

    it('ignores an invalid column instead of throwing', async () => {
      const { service, repo } = makeService();

      await expect(
        service.findAll({
          page: 1,
          limit: 10,
          sortBy: 'not_a_real_column',
        } as any),
      ).resolves.toBeDefined();

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).not.toHaveBeenCalled();
    });
  });

  describe('orderBy direction whitelist (input hygiene, not a SQLi fix)', () => {
    // GetTableDto.orderBy is typed 'ASC' | 'DESC' at compile time only --
    // class-validator does not enforce that at runtime. This is NOT a SQL
    // injection vector: TypeORM's own SelectQueryBuilder.addOrderBy() throws
    // a TypeORMError for any direction other than the literal 'ASC'/'DESC'
    // (verified against the installed typeorm 0.3.x), so a malformed value
    // never reaches generated SQL regardless of this whitelist. What these
    // tests prove is the crash-prevention behavior: a bad orderBy value
    // falls back to a sane default instead of throwing uncaught.
    it('falls back to ASC for a malformed value on the flat-column path, instead of throwing', async () => {
      const { service, repo } = makeService();

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: 'name',
        orderBy: 'ASC,(select pg_sleep(5))--',
      } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).toHaveBeenCalledWith('entity.name', 'ASC');
    });

    it('falls back to ASC for a malformed value on the relation-qualified path, instead of throwing', async () => {
      const { service, repo } = makeService();

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: 'division.name',
        orderBy: 'DESC; drop table x --',
      } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).toHaveBeenCalledWith('division.name', 'ASC');
    });

    it('still honors a legitimate DESC direction', async () => {
      const { service, repo } = makeService();

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: 'name',
        orderBy: 'DESC',
      } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).toHaveBeenCalledWith('entity.name', 'DESC');
    });

    it('defaults to ASC when orderBy is missing', async () => {
      const { service, repo } = makeService();

      await service.findAll({ page: 1, limit: 10, sortBy: 'name' } as any);

      const qb = repo.createQueryBuilder.mock.results[0].value;
      expect(qb.orderBy).toHaveBeenCalledWith('entity.name', 'ASC');
    });
  });
});
