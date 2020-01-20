if (!process.env.GATSBY_DB_NODES || process.env.GATSBY_DB_NODES === `redux`) {
  const { runSift } = require(`../run-sift`)
  const { store } = require(`../index`)
  const { actions } = require(`../actions`)
  const {
    GraphQLObjectType,
    GraphQLNonNull,
    GraphQLID,
    GraphQLString,
    GraphQLList,
  } = require(`graphql`)

  const mockNodes = () => [
    {
      id: `id_1`,
      string: `foo`,
      slog: `abc`,
      deep: { flat: { search: { chain: 123 } } },
      internal: {
        type: `notTest`,
        contentDigest: `0`,
      },
    },
    {
      id: `id_2`,
      string: `bar`,
      slog: `def`,
      deep: { flat: { search: { chain: 500 } } },
      internal: {
        type: `test`,
        contentDigest: `0`,
      },
    },
    {
      id: `id_3`,
      slog: `abc`,
      string: `baz`,
      deep: { flat: { search: { chain: 300 } } },
      internal: {
        type: `test`,
        contentDigest: `0`,
      },
    },
    {
      id: `id_4`,
      string: `qux`,
      slog: `def`,
      deep: { flat: { search: { chain: 300 } } },
      internal: {
        type: `test`,
        contentDigest: `0`,
      },
      first: {
        willBeResolved: `willBeResolved`,
        second: [
          {
            willBeResolved: `willBeResolved`,
            third: {
              foo: `foo`,
            },
          },
        ],
      },
    },
  ]

  beforeEach(() => {
    store.dispatch({ type: `DELETE_CACHE` })
    mockNodes().forEach(node =>
      actions.createNode(node, { name: `test` })(store.dispatch)
    )
  })
  ;[
    { desc: `with cache`, cb: () => new Map() }, // Avoids sift for flat filters
    { desc: `no cache`, cb: () => undefined }, // Always goes through sift
  ].forEach(({ desc, cb: createIndexCache }) => {
    describe(`run-sift [${desc}]`, () => {
      const typeName = `test`
      const gqlType = new GraphQLObjectType({
        name: typeName,
        fields: () => {
          return {
            id: { type: new GraphQLNonNull(GraphQLID) },
            string: { type: GraphQLString },
            first: {
              type: new GraphQLObjectType({
                name: `First`,
                fields: {
                  willBeResolved: {
                    type: GraphQLString,
                    resolve: () => `resolvedValue`,
                  },
                  second: {
                    type: new GraphQLList(
                      new GraphQLObjectType({
                        name: `Second`,
                        fields: {
                          willBeResolved: {
                            type: GraphQLString,
                            resolve: () => `resolvedValue`,
                          },
                          third: new GraphQLObjectType({
                            name: `Third`,
                            fields: {
                              foo: GraphQLString,
                            },
                          }),
                        },
                      })
                    ),
                  },
                },
              }),
            },
          }
        },
      })
      describe(`filters by just id correctly`, () => {
        it(`eq operator`, async () => {
          const queryArgs = {
            filter: {
              id: { eq: `id_2` },
            },
          }

          const resultSingular = await runSift({
            gqlType,
            queryArgs,
            firstOnly: true,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          const resultMany = await runSift({
            gqlType,
            queryArgs,
            firstOnly: false,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          expect(resultSingular.map(o => o.id)).toEqual([mockNodes()[1].id])
          expect(resultMany.map(o => o.id)).toEqual([mockNodes()[1].id])
        })

        it(`eq operator honors type`, async () => {
          const queryArgs = {
            filter: {
              id: { eq: `id_1` },
            },
          }

          const resultSingular = await runSift({
            gqlType,
            queryArgs,
            firstOnly: true,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          const resultMany = await runSift({
            gqlType,
            queryArgs,
            firstOnly: false,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          // `id-1` node is not of queried type, so results should be empty
          expect(resultSingular).toEqual([])
          expect(resultMany).toEqual(null)
        })

        it(`non-eq operator`, async () => {
          const queryArgs = {
            filter: {
              id: { ne: `id_2` },
            },
          }

          const resultSingular = await runSift({
            gqlType,
            queryArgs,
            firstOnly: true,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          const resultMany = await runSift({
            gqlType,
            queryArgs,
            firstOnly: false,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          expect(resultSingular.map(o => o.id)).toEqual([mockNodes()[2].id])
          expect(resultMany.map(o => o.id)).toEqual([
            mockNodes()[2].id,
            mockNodes()[3].id,
          ])
        })
        it(`return empty array in case of empty nodes`, async () => {
          const queryArgs = { filter: {}, sort: {} }
          const resultSingular = await runSift({
            gqlType,
            queryArgs,
            firstOnly: true,
            nodeTypeNames: [`NonExistentNodeType`],
            typedKeyValueIndexes: createIndexCache(),
          })
          expect(resultSingular).toEqual([])
        })
      })
      describe(`filters by arbitrary property correctly`, () => {
        it(`eq operator flat single`, async () => {
          const queryArgs = {
            filter: {
              slog: { eq: `def` },
            },
          }

          const resultSingular = await runSift({
            gqlType,
            queryArgs,
            firstOnly: true,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          expect(Array.isArray(resultSingular)).toBe(true)
          expect(resultSingular.length).toEqual(1)

          resultSingular.map(node => {
            expect(node.slog).toEqual(`def`)
          })
        })
        it(`eq operator flat many`, async () => {
          const queryArgs = {
            filter: {
              slog: { eq: `def` },
            },
          }

          const resultMany = await runSift({
            gqlType,
            queryArgs,
            firstOnly: false,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          expect(Array.isArray(resultMany)).toBe(true)
          expect(resultMany.length).toEqual(2)

          resultMany.map(node => {
            expect(node.slog).toEqual(`def`)
          })
        })
        it(`eq operator deep single`, async () => {
          const queryArgs = {
            filter: {
              deep: { flat: { search: { chain: { eq: 300 } } } },
            },
          }

          const resultSingular = await runSift({
            gqlType,
            queryArgs,
            firstOnly: true,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          expect(Array.isArray(resultSingular)).toBe(true)
          expect(resultSingular.length).toEqual(1)

          resultSingular.map(node => {
            expect(node.deep.flat.search.chain).toEqual(300)
          })
        })
        it(`eq operator deep many`, async () => {
          const queryArgs = {
            filter: {
              deep: { flat: { search: { chain: { eq: 300 } } } },
            },
          }

          const resultMany = await runSift({
            gqlType,
            queryArgs,
            firstOnly: false,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          expect(Array.isArray(resultMany)).toBe(true)
          expect(resultMany.length).toEqual(2)

          resultMany.map(node => {
            expect(node.deep.flat.search.chain).toEqual(300)
          })
        })
        it(`eq operator deep miss single`, async () => {
          const queryArgs = {
            filter: {
              deep: { flat: { search: { chain: { eq: 999 } } } },
            },
          }

          const resultSingular = await runSift({
            gqlType,
            queryArgs,
            firstOnly: true,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          expect(Array.isArray(resultSingular)).toBe(true)
          expect(resultSingular.length).toEqual(0)
        })
        it(`eq operator deep miss many`, async () => {
          const queryArgs = {
            filter: {
              deep: { flat: { search: { chain: { eq: 999 } } } },
            },
          }

          const resultMany = await runSift({
            gqlType,
            queryArgs,
            firstOnly: false,
            nodeTypeNames: [gqlType.name],
            typedKeyValueIndexes: createIndexCache(),
          })

          expect(resultMany).toBe(null)
        })
      })
    })
  })

  describe(`reset index cache`, () => {
    it(`should reset the index cache if a new node was added`, () => {
      actions.createNode(
        {
          internal: {
            type: `Test`,
          },
        },
        {
          name: `tests`,
        }
      )(jest.fn())
    })
  })
} else {
  it(`Loki skipping redux run-sift`, () => {
    expect(true).toEqual(true)
  })
}
