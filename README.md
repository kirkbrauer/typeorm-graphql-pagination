# TypeORM GraphQL Pagination
> Opinionated GraphQL style pagination for TypeORM.

## Install
TypeORM GraphQL Pagination runs on Node.js and is available as a NPM package. It can be installed as a normal NPM package:

```bash
$ npm install typeorm-graphql-pagination
```
Or using yarn:
```bash
$ yarn add typeorm-graphql-pagination
```

## Usage
This package uses the pagination model presented in the official [GraphQL documentation](https://graphql.org/learn/pagination/). You must create your own GraphQL types for each connection, edge, and order to take full advantage of the pagination features.
```typescript
import { paginate, paginationTypeDefs } from 'typeorm-graphql-pagination';
import { getConnection } from 'typeorm';
import { gql } from 'apollo-server';

// GraphQL typeDefs
const typeDefs = gql`
  # Inject the pagination type definitions
  ${paginationTypeDefs}

  type Query {
    users(first: Int, after: String, orderBy: UserOrder): UserConnection!
  }
  
  type User {
    id: ID!
    name: String
    email: String
    created_at: Int
    updated_at: Int
  }

  enum UserOrderField {
    NAME
    EMAIL
    CREATED_AT
    UPDATED_AT
  }

  input UserOrder {
    direction: OrderDirection
    field: UserOrderField
  }

  type UserEdge {
    node: User
    cursor: String
  }

  type UserConnection {
    totalCount: Int
    edges: [UserEdge]
    pageInfo: PageInfo
  }
`;

// GraphQL resolvers
const resolvers = {
  Query: {
    users(obj: any, { first, after, orderBy }) {
      // Return the paginated connection
      return paginate({
        first, // How many results to load
        after, // The cursor to find results after
        orderBy // The order to return the results in
      }, {
        type: 'User', // The entity name
        alias: 'user', // The alias to use in queries
        validateCursor: true, // The cursor's index must match the results
        orderFieldToKey: (field: string) => field.toLowerCase(),
        // Here we pass in a repository, but you can also use a select query builder
        repository: getConnection().getRepository(User)
        // queryBuilder: getConnection()
        //  .getRepository(User)
        //  .createQueryBuilder('user')
        //  .where('email_verified = true')
      });
    }
  },
  //...
};

//...
```

## Testing
```bash
$ npm test
```

## Licence
Copyright (c) 2019 Kirk Brauer.

Released under the [MIT license](https://tldrlegal.com/license/mit-license).