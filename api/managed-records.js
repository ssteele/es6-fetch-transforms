import fetch from "../util/fetch-fill";
import URI from "urijs";

// /records endpoint
window.path = "http://localhost:3000/records";

/*
define constants
 */

const defaultRequestOptions = {
  page: 1,
  colors: [],
  limit: 10
};

const primaryColors = [
  'red',
  'blue',
  'yellow'
];

/*
pre-API transforms
 */

let RequestHandler = {
  /**
   * Calculate record offset from page and limit options
   * @param  {number} page  Supplied page
   * @param  {number} limit Supplied records count
   * @return {number}       Records offset
   */
  calculateOffset(page = 1, limit = 10) {
    return (page * limit) - limit;
  },

  /**
   * Determine number of records to be received
   * @return {number} Limit
   */
  resolveLimit() {
    return defaultRequestOptions.limit;
  },

  /**
   * Determine records offset
   * @return {number} Records offset
   */
  resolveOffset() {
    let page = ('number' === typeof this.options.page) ? parseInt(this.options.page) : defaultRequestOptions.page;
    return this.calculateOffset(page, defaultRequestOptions.limit);
  },

  /**
   * Determine desired colors
   * @return {Array} Composed of color strings
   */
  resolveColor() {
    return this.options.colors || defaultRequestOptions.colors;
  },

  /**
   * Generate payload to be sent to records endpoint
   * @param  {Object} options Supplied `retrieve` options
   * @return {Object}         Records payload
   */
  resolvePayload(options = {}) {
    this.options = options;
    return {
      limit: this.resolveLimit(),
      offset: this.resolveOffset(),
      "color[]": this.resolveColor()                                // API 400 if braces not supplied for single color requests
    };
  }
};

/*
prepare API request
 */

/**
 * Generate GET request with query parameters for records endpoint
 * @param  {string} path    Records endpoint
 * @param  {Object} payload Query parameters
 * @return {string}         Generated records endpoint
 */
let generateApiGetRequest = (path, payload = {}) => {
  return URI(path).search(payload);
};

/**
 * Transform request options and generate records request
 * @param  {Object} options Supplied `retrieve` options
 * @return {string}         Generated records endpoint
 */
let formApiRequest = (options = {}) => {
  let payload = RequestHandler.resolvePayload(options);
  return generateApiGetRequest(path, payload);
};

/*
request data from API
 */

/**
 * Translate supplied options, generate records request, and execute request
 * @param  {Object} options Supplied `retrieve` options
 * @return {Promise}        Data records on success
 */
let request = (options = {}) => {
  let uri = formApiRequest(options);

  return fetch(uri)
    .then(response => {
      if (response.ok) {
        return response.json();
      } else if (response.status > 400 && response.status < 600) {
        throw new Error('Received ' + response.status + ' response code during fetch');
      }
    })
    .catch(error => console.log('Error: ', error.message));
};

/**
 * Request a specified page (request wrapper)
 * @param  {Object}  options Supplied `retrieve` options
 * @param  {number}  page    Page
 * @return {Promise}         Data records on success
 */
let peek = (options = {}, page = 1) => {
  options.page = page;
  return request(options);
};

/**
 * Request all pages necessary to fulfill a call to `retrieve`
 * @param  {Object} options Supplied `retrieve` options
 * @return {Promise}        Data from all requests on success
 */
let requestPages = (options = {}) => {
  let currentPage = options.page || defaultRequestOptions.page;

  /*
  current (desired `retrieve`) page
   */
  let current = request(options)
    .then(response => response)
    .catch(error => console.log('Error: ', error.message));

  /*
  previous page number if records exist
   */
  let previous = peek(options, currentPage - 1)
    .then(response => (response && response.length > 0) ? currentPage - 1 : null)
    .catch(error => console.log('Error: ', error.message));

  /*
  next page number if records exist
   */
  let next = peek(options, currentPage + 1)
    .then(response => (response && response.length > 0) ? currentPage + 1 : null)
    .catch(error => console.log('Error: ', error.message));

  return Promise.all([current, previous, next])
    .then(responses => {
      let response = responses[0];

      // attach prev/next page numbers to current page response
      response.previousPage = responses[1];
      response.nextPage = responses[2];

      return response;
    })
    .catch(error => console.log('Error: ', error.message));
};

/*
post-API transform
 */

let ResponseHandler = {
  /**
   * Amend `isPrimary` property to records based on color
   * @return {Array} Record objects
   */
  deriveAndAmendIsPrimary() {
    return this.response.map((record) => {
      record.isPrimary = primaryColors.includes(record.color) ? true : false;
      return record;
    });
  },

  /**
   * Pull a simple array of record IDs from the response
   * @return {Array} Record IDs
   */
  resolveIds() {
    return this.response.map(record => record.id);
  },

  /**
   * Filter open records
   * @return {Array} Open record objects
   */
  resolveOpen() {
    return this.response.filter(record => record.disposition === 'open');
  },

  /**
   * Determine number of closed records of primary color
   * @return {number} Closed primary color record count
   */
  resolveClosedPrimaryCount() {
    return this.response.filter(record => record.disposition === 'closed' && record.isPrimary).length;
  },

  /**
   * Form the desired response from the records requested
   * @param  {Array} response Record objects
   * @param  {Object} options Supplied `retrieve` options
   * @return {Object}         Desired data in the proper format
   */
  resolveResponse(response = [], options = {}) {
    this.response = response;
    this.options = options;

    this.deriveAndAmendIsPrimary();

    return {
      previousPage: this.response.previousPage,
      nextPage: this.response.nextPage,
      ids: this.resolveIds(),
      open: this.resolveOpen(),
      closedPrimaryCount: this.resolveClosedPrimaryCount()
    };
  }
};

/**
 * Transform requested records
   * @param  {Array} response Record objects
   * @param  {Object} options Supplied `retrieve` options
   * @return {Object}         Desired data in the proper format
 */
let transformResponse = (response = [], options = {}) => {
  let transformedResponse = ResponseHandler.resolveResponse(response, options);
  return ResponseHandler.resolveResponse(response, options);
};

/*
entry point
 */

/**
 * Take supplied arguments, transform, create request, and transform the response into a desired format
 * @param  {Object}  options Desired records in the following input format: `({page: 2, colors: ["red", "brown"]})
 * @return {Promise}         Desired data in the proper output format on success
 */
let retrieve = (options = {}) => {
  return requestPages(options)
    .then(response => transformResponse(response, options))
    .catch(error => console.log('Error: ', error.message));
};

export default retrieve;
