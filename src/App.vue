<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script>
import axios from 'axios'
export default {
  name: 'App',
  data () {
    return {
      titles: [],
      data1: {
          "page": "1",
          "per_page": 10,
          "total": 13,
          "total_pages": 2,
          "data": [
              {
              "Poster": "https://images-na.ssl-images-amazon.com/images/M/MV5BYjFhN2RjZTctMzA2Ni00NzE2LWJmYjMtNDAyYTllOTkyMmY3XkEyXkFqcGdeQXVyNTA0OTU0OTQ@._V1_SX300.jpg",
              "Title": "Italian Spiderman",
              "Type": "movie",
              "Year": 2007,
              "imdbID": "tt2705436"
              },
              {
              "Poster": "https://images-na.ssl-images-amazon.com/images/M/MV5BMjQ4MzcxNDU3N15BMl5BanBnXkFtZTgwOTE1MzMxNzE@._V1_SX300.jpg",
              "Title": "Superman, Spiderman or Batman",
              "Type": "movie",
              "Year": 2011,
              "imdbID": "tt2084949"
              },
              {
              "Poster": "N/A",
              "Title": "Spiderman",
              "Type": "movie",
              "Year": 1990,
              "imdbID": "tt0100669"
              },
              {
              "Poster": "N/A",
              "Title": "Spiderman",
              "Type": "movie",
              "Year": 2010,
              "imdbID": "tt1785572"
              },
              {
              "Poster": "N/A",
              "Title": "Fighting, Flying and Driving: The Stunts of Spiderman 3",
              "Type": "movie",
              "Year": 2007,
              "imdbID": "tt1132238"
              },
              {
              "Poster": "http://ia.media-imdb.com/images/M/MV5BMjE3Mzg0MjAxMl5BMl5BanBnXkFtZTcwNjIyODg5Mg@@._V1_SX300.jpg",
              "Title": "Spiderman and Grandma",
              "Type": "movie",
              "Year": 2009,
              "imdbID": "tt1433184"
              },
              {
              "Poster": "N/A",
              "Title": "The Amazing Spiderman T4 Premiere Special",
              "Type": "movie",
              "Year": 2012,
              "imdbID": "tt2233044"
              },
              {
              "Poster": "N/A",
              "Title": "Amazing Spiderman Syndrome",
              "Type": "movie",
              "Year": 2012,
              "imdbID": "tt2586634"
              },
              {
              "Poster": "N/A",
              "Title": "Hollywood's Master Storytellers: Spiderman Live",
              "Type": "movie",
              "Year": 2006,
              "imdbID": "tt2158533"
              },
              {
              "Poster": "N/A",
              "Title": "Spiderman 5",
              "Type": "movie",
              "Year": 2008,
              "imdbID": "tt3696826"
              }
          ]
      },
      data2: {
        "page": "2",
        "per_page": 10,
        "total": 13,
        "total_pages": 2,
        "data": [
            {
            "Poster": "N/A",
            "Title": "They Call Me Spiderman",
            "Type": "movie",
            "Year": 2016,
            "imdbID": "tt5861236"
            },
            {
            "Poster": "N/A",
            "Title": "The Death of Spiderman",
            "Type": "movie",
            "Year": 2015,
            "imdbID": "tt5921428"
            },
            {
            "Poster": "https://images-na.ssl-images-amazon.com/images/M/MV5BZDlmMGQwYmItNTNmOS00OTNkLTkxNTYtNDM3ZWVlMWUyZDIzXkEyXkFqcGdeQXVyMTA5Mzk5Mw@@._V1_SX300.jpg",
            "Title": "Spiderman in Cannes",
            "Type": "movie",
            "Year": 2016,
            "imdbID": "tt5978586"
            }
        ]
      }
    }
  },
  created () {
    this.titles = this.getMovieTitles('spiderman')
  },
  methods: {
    async getMovieTitles (substr) {
      let movies = []
      let queryParams = {
          Title: substr,
          Page: 1
      }
      let result = {}
      let data1 = this.data1
      let data2 = this.data2
      function getMovies (params) {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (params.Page === 1) {
              resolve(data1)
            }
            if (params.Page === 2) {
              resolve(data2)
            }
          }, 100)
        })
      }
      for (; queryParams.Page <= 2; ++queryParams.Page) {
        await getMovies(queryParams).then(res => {
          movies = movies.concat(res.data)
        })
      }
      return movies.map(movie => movie.Title).sort()
    }
  }
}
</script>

<style>

</style>
