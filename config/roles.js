const allRoles = {
    customer: ['getMovies', 'searchMovies', 'getGenres', 'getCountries',],
    provider: ['getMovies', 'searchMovies', 'getGenres', 'getCountries',],
    admin: ['getUsersAdmin', 'manageUsersAdmin', 'getUserAdmin', 'getMoviesAdmin', 'searchMoviesAdmin', 'editMoviesAdmin', 'getGenresAdmin', 'getCountriesAdmin', 'downloadMoviesAdmin', 'editGenresAdmin', 'uploadMoviesAdmin', 'streamMoviesAdmin', 'createGenresAdmin', 'createCountryAdmin', 'deleteMoviesAdmin', 'deleteGenresAdmin', 'deleteCountriesAdmin', ],
  };

  const roles = Object.keys(allRoles);
  const roleRights = new Map(Object.entries(allRoles));
  
  module.exports = {
    roles,
    roleRights,
  };
  