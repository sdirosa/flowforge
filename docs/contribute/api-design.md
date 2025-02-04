# HTTP API of the FlowForge platform

## Object Ids

Most database models have a primary key of an auto-incrementing integer stored in
the `id` column.

These ids are internal properties of the models and should *not* be exposed via the
API. This is because they can be guessed and leak information about how many instances
of any particular model exists.

All model instances have an auto-generated `hashid` property that is an encoded version
of the `id` property. This property should be used on the API but aliased as the
`id` property.

Each database model has a pair of helper functions to encode and decode hashids
to/from the true `id` value:

```
const encodedHashid = app.db.models.User.encodeHashid(123);
const objectId = app.db.models.User.decodeHashid("edjEbo2K1w")
```

## API Path design

### Admin routes

All admin-only routes exist under:

```
/api/v1/admin/...
```

### Logged-in user routes

All routes relating to the logged-in user exist under:

```
/api/v1/user/...
```

### Object collection routes

API routes that related to objects in collections follow the pattern:

```
/api/v1/<plural-noun>/<instance-id>/...
```

## Implementing routes

All API routes exist under `forge/routes/api` in the repository, grouped into
files based on the entity/functionality the api is related to.

All requests will have already been validated to ensure they are being made with
a valid session for a logged in user, or an access token.

If there is a valid session, `request.session.User` will be the requesting user.

### Opening a route to anonymous users

In rare cases, a route needs to be accessible to anonymous users. To by-pass
the built-in preHandler, you can set `allowAnonymous` on the routes `config` object:

```
app.get('/', { config: { allowAnonymous: true } }, async (request, reply) => {
     ...
})
```

### Team routes

Routes under `forge/routes/api/team.js` that relate to a specific team,
must use `:teamId` as the placeholder in the route. A request preHandler will
use that to ensure the requesting user has permission to access the project.

The following properties will then be available on the `request`:

 - `request.team` - the team
 - `request.teamMembership` - the requesting user's role on the team

### Project routes

Routes under `forge/routes/api/project.js` that relate to a specific project,
must use `:projectId` as the placeholder in the route. A request preHandler will
use that to ensure the requesting user has permission to access the project.

The following properties will then be available on the `request`:

 - `request.project` - the project
 - `request.teamMembership` - the requesting user's role on the team that owns the project


### User/role permissions

Permissions are defined in `forge/routes/auth/permissions.js`.

Each permission specifies the role a user must have in order to have that permission.

If a route requires a particular permission, it can use `app.needsPermission` to
generate a preHandler function that will ensure any requesting user has that
permission.

For example, to add a user to a team, the requesting user needs to have
`"team:user:add"`:

```
app.post('/', { preHandler: app.needsPermission("team:user:add") }, async (request, reply) => {
    // This is defined under forge/routes/api/teamMembers.js - and is mounted
    // under the path `/api/v1/teams/:teamId/members/`
    // Due to the team route preHandler, this means `request.teamMembership`
    // will be defined and will be used by the `needsPermission` handler
});
```

## Error formats

If a route needs to return an error it should respond with a payload in the format:

```
{
    code: 'error_code',
    error: 'Human-readable message'
}
```

The `code` property should be a well-defined string that can be used to programmatically
identify the error without relying on the human-readable message.

There are a set of predefined codes that should be used where appropriate:

 - `unauthorized`
 - `invalid_request`
 - `unexpected_error`

If the error is relating to an invalid option/parameter/object selection, then the code
should be:

 - `invalid_<name of property>`

For example: `invalid_project_name`.


## Pagination & Search

All routes that return collections of things must use pagination to allow for
future growth, and provide a way to search the collection.


### Pagination

We use a cursor-based approach to our pagination. A cursor is a pointer to an entity
in the collection and provides the starting point for what should be returned.

 - End-points accept `cursor` and `limit` parameters
 - If `cursor` is not provided, it returns from the beginning of the collection.
   For some end-points, this will mean returning the most recent entries -
   the `/api/v1/projects/:id/logs` for example.
 - Each end-point should have a sensible default for the `limit` parameter

The response object for paginated end-points should have the format:

```
{
    "meta": {
        "next_cursor": "16416724188790000",
    },
    "<object-type>": [ ]
    "count": 123
}
```

The `meta` property contains information to help the client navigate the collection.

 - `next_cursor` - if set, provides the cursor to use to get the next page of results
 - `previous_cursor` - if set, provides the cursor to use to get the previous page of results. Note
    that not all end-points need to be navigable in both directions so may never return
    `previous_cursor`.

The `<object-type>` property should be called the appropriate plural form of what is being returned,
such as `projects`.

The `count` property is optional and indicates the total number of objects in the collection.
End-points *should* include it if the number is known and is of material use. It is *not*
returned by end-points used to query logs etc as the total count is a constantly changing
value.

#### Cursor design

A cursor should be able to point directly at an entity in the collection. It could
be the entity hashid, or a timestamp if it is a time-series collection such as the
logs.

The cursor should *not* be the internal `id` of the entity in the collection - as we
do not expose those ids on the api, instead using the `hashid` value as the external `id`.

If an end-point supports navigating the collection in reverse (by returning `previous_cursor`),
the cursor should be prefixed with `-` to indicate the query should be in the opposite
direction to the collection's natural order.

### Search

Search is done as simple case-insensitive text-based queries against string columns
in the database model. This is a crude but effective way to implement search, but
may need a more comprehensive approach in the future.

### Implementing pagination & search

Within a route handler for a paginated end-point, the following helper function
can be used to get the pagination options from the request, as well as specifying
default options:

```
const paginationOptions = app.getPaginationOptions(request, {limit: 30})

// paginationOptions.limit = how many results to return
// paginationOptions.cursor = starting cursor
// paginationOptions.query = search string to use

```

Typically these properties will be passed to the appropriate database model's `getAll`
function.

For example, the imaginary `Thing` model:

```
const { buildPaginationSearchClause } = require('../utils')

...

getAll: async (pagination = {}, where = {}) => {
    // Ensure a sensible default limit for this particular type of thing
    const limit = parseInt(pagination.limit) || 30

    // Decode the cursor from hashid to database id
    if (pagination.cursor) {
        pagination.cursor = M.Thing.decodeHashid(pagination.cursor)
    }

    // Build the full where query using the buildPaginationSearchClause utility.
    // We pass in the list of columns that should be searched against
    where = buildPaginationSearchClause(pagination, where, ['Thing.name'])

    // Run the query
    const { count, rows } = await this.findAndCountAll({
        where,
        order: [['id', 'ASC']],
        limit
    })

    // Return the results with the additional metadata
    return {
        meta: {
            next_cursor: rows.length === limit ? rows[rows.length - 1].hashid : undefined
        },
        count,
        things: rows
    }
}
```

