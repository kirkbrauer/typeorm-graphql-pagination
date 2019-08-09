import { ObjectLiteral, SelectQueryBuilder, Repository } from 'typeorm';
import gql from 'gql-tag';
import { encode, decode } from 'opaqueid';

/**
 * The basic pagination type defintions for integration with a GraphQL schema.
 */
export const paginationTypeDefs = gql`
  enum OrderDirection {
    ASC
    DESC
  }

  type PageInfo {
    startCursor: String
    endCursor: String
    hasNextPage: Boolean
    hasPreviousPage: Boolean
  }
`;

/**
 * The invalid cursor type error.
 */
export class InvalidCursorTypeError extends Error {
  /**
   * The expected cursor type.
   */
  private expectedType: string;

  /**
   * The actual cursor type.
   */
  private actualType: string;

  /**
   * Constructs a new InvalidCursorTypeError
   * @param expectedType The expected cursor type.
   * @param actualType The actual cursor type.
   */
  constructor(expectedType: string, actualType: string) {
    super();
    this.name = 'Invalid Cursor Type Error';
    this.expectedType = expectedType;
    this.actualType = actualType;
    this.message = `Invalid cursor, expected type ${expectedType}, but got type ${actualType}`;
  }
}

/**
 * The invalid cursor error.
 */
export class InvalidCursorError extends Error {
  /**
   * Constructs a new InvalidCursorError.
   */
  constructor() {
    super();
    this.name = 'Invalid Cursor Error';
    this.message = 'Invalid cursor';
  }
}

/**
 * A cursor object.
 */
export interface Cursor {
  /**
   * The ID of the entity.
   */
  id: string;
  /**
   * The entity type.
   */
  type: string;
  /**
   * The entity index in the results.
   */
  index: number;
}

/**
 * Encodes a pagination cursor.
 * @param id The entity ID.
 * @param type The entity type.
 * @param index The entity index in the results.
 */
export function encodeCursor(id: string, type: string, index: number) {
  return encode(`C|${type}|${id}|${index}`);
}

/**
 * Decodes a pagination cursor.
 * @param cursor The cursor to decode.
 * @param type The entity type.
 */
export function decodeCursor(cursor: string, type: string): Cursor {
  // Split the cursor
  const split: any[] = decode(cursor).split('|');
  // Verify that it is a valid cursor
  if (split[0] !== 'C') throw new InvalidCursorError();
  // Throw an error if the cursor type is incorrect
  if (split[1] !== type) throw new InvalidCursorTypeError(type, split[1]);
  // Return the cursor data
  return {
    id: split[2],
    type: split[1],
    index: split[3] * 1
  };
}

/**
 * A page info object.
 */
export interface PageInfo {
  /**
   * The last cursor in the page.
   */
  endCursor?: string;
  /**
   * The first cursor in the page.
   */
  startCursor?: string;
  /**
   * Is there another page after.
   */
  hasNextPage: boolean;
  /**
   * Is there a preceding page.
   */
  hasPreviousPage: boolean;
}

/**
 * An edge object.
 */
export interface Edge<T> {
  node: T;
  cursor: string;
}

/**
 * A connection object.
 */
export interface Connection<T> {
  totalCount: number;
  pageInfo: PageInfo;
  edges: Edge<T>[];
}

/**
 * The order direction.
 */
export enum OrderDirection {
  ASC = 'ASC',
  DESC = 'DESC'
}

/**
 * A pagination order object.
 */
export interface Order<Field = string> {
  /**
   * The direction to order the results.
   */
  direction: OrderDirection;
  /**
   * The field to order by.
   */
  field: Field;
}

/**
 * The find options object for the pagination query.
 */
export interface FindOptions<OrderField = string> {
  /**
   * How many results to load.
   */
  first: number;
  /**
   * The order to return the results in.
   */
  orderBy?: Order<OrderField>;
  /**
   * A cursor to find results after.
   */
  after?: string;
}

/**
 * The pagination options object.
 */
export interface PaginateOptions<Entity extends Object, OrderField = string> {
  /**
   * The name of the entity type.
   */
  type: string;
  /**
   * The alias to use in TypeORM queries.
   */
  alias: string;
  /**
   * Should the cursor be validated for integrity.
   */
  validateCursor?: boolean;
  /**
   * A function to convert an order field string or enum to a field name.
   */
  orderFieldToKey: (orderField: OrderField) => string;
  /**
   * The TypeORM query build.
   */
  queryBuilder?: SelectQueryBuilder<Entity>;
  /**
   * The TypeORM repository.
   */
  repository?: Repository<Entity>;
}

/**
 * Paginates the provided query with the find options.
 * @param findOptions The user-defined find options.
 * @param options The pagination options.
 */
export async function paginate<Entity extends ObjectLiteral, OrderField>(
  findOptions: FindOptions<OrderField>,
  options: PaginateOptions<Entity, OrderField>
): Promise<Connection<Entity>> {
  // If no cursor is provided, start at the beginning
  let skip = 0;
  let decodedCursor: Cursor;
  // Check if we have a cursor
  if (findOptions.after) {
    // Attempt to decode the cursor
    decodedCursor = decodeCursor(findOptions.after, options.type);
    // Include the cursor in the query to check if there is a previous page
    skip = decodedCursor.index;
  }
  // Determine if there is a page before or after by taking one or two extra results
  // If we are given a cursor, select the result before and after
  // Otherwise, only take one extra result to determine if there is another page
  const dbTake = findOptions.after
    ? findOptions.first + 2
    : findOptions.first + 1;
  // Get the query
  let query: SelectQueryBuilder<Entity>;
  if (options.queryBuilder) {
    query = options.queryBuilder;
  } else if (options.repository) {
    query = options.repository.createQueryBuilder(options.alias);
  } else {
    // Throw an error if no query builder or repository is provided
    throw Error(
      'A QueryBuilder or Repository object must be provided to paginate.'
    );
  }
  // Order by the requested order
  // Use the provided function to convert the user-facing field name to the actual field name
  const field = options.orderFieldToKey(findOptions.orderBy.field);
  // Use the alias and the field name to generate the order key
  const key = `${options.alias}.${field}`;
  // Order by the field and direction
  query = query.orderBy({
    [key]: findOptions.orderBy.direction
  });
  // Get the total result count
  const totalCount = await query.getCount();
  // Execute the query
  const results = await query
    .skip(skip)
    .take(dbTake)
    .getMany();
  // Make sure the cursor is valid
  if (decodedCursor && options.validateCursor) {
    // Make sure the ID of the first result matches the cursor ID
    if (decodedCursor.id !== results[0].id) throw new InvalidCursorError();
  }
  // Convert the nodes into edges
  const edges: Edge<Entity>[] = [];
  // Exclude the first and last results
  for (
    let i = findOptions.after ? 1 : 0;
    i < (results.length < dbTake ? results.length : results.length - 1);
    i += 1
  ) {
    edges.push({
      node: results[i],
      cursor: encodeCursor(results[i].id, options.type, i + skip)
    });
  }
  // Generate the page info
  const pageInfo: PageInfo = {
    startCursor: edges[0] ? edges[0].cursor : null,
    endCursor: edges[edges.length - 1] ? edges[edges.length - 1].cursor : null,
    hasNextPage: results.length === dbTake,
    hasPreviousPage: skip !== 0
  };
  // Return the connection
  return {
    pageInfo,
    edges,
    totalCount
  };
}
