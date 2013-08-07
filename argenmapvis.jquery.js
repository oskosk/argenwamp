/**
 *
 * argenmap.vis. Plugin de jquery que carga una vista de mapa
 * descripta en json sobre un mapa de argenmap.
 * acepta 
 */
;(function($){

  function Argenmapvis(el, options) {

    //Defaults:
    this.defaults = {
      source: '0AqdTbs1TYvZKdFlQVDNBdFVKSFZzci04UE5UYkpmYmc',
      vistaInicial: {
        lat: -34,
        lng: -59,
        zoom: undefined,
        capa: undefined
      },
        //mapa de campos
        //yo le doy bola solo a titulo capa recurso tiporecurso
        //zoom y descripcion.
        // si en tu json, tenes otros campos, pasale un objeto .argenwamp({objeto})
        // con la propiedad  field_map y el mapeo del nombre de tus campos a estos.
        // Por default el mapa es un mapeo dummy.
      field_map : {

        titulo: "titulo",
        capa: "capa",
        recurso: "recurso",
        tiporecurso: "tiporecurso",
        zoom: "zoom",
        descripcion: "descripcion"
      }
    };

    //Extending options:
    this.opts = $.extend({}, this.defaults, options);

    //Privates:
    this.$el = $(el);
    this.entries = [];
    this.marcadores = [];
    this.wms = [];
    this.kml = [];
  }

  // Separate functionality from object creation
  Argenmapvis.prototype = {

    init: function() {
      var _this = this;
      _this.$el.activity({width:5.5});
      $.when( _this.getDoc() ).done(function() {
          _this.magic();  
          _this.$el.activity(false);
      }).fail(function() {
        console.log('source inválido');
        _this.$el.activity(false);
      });
    },


    //Busca el JSON de la Google Docs Spreadsheet
    getDoc: function() {
      var _this = this;
      var deferred = $.Deferred();

      var source = _this.opts.source;

      var valid_url = ($.url(source ,true).attr('host') !== '');
        /*
         * Si source no es una url válida con domain, 
         * asumo que es un id de google docs
         */
      if (! valid_url ) {
        _this.getGoogleDocsJSON(source, deferred);
      } else {
        _this.getJSON(source, deferred);
      }
      
      return deferred.promise();      
    },

    getJSON: function (source, deferred) {
      var _this = this;
      $.get(source, function(data){
        _this.entries = data;
        _this.entries = _this._mapFields();
         _this.parsePlainJSON(deferred);        
      });
    },

    getGoogleDocsJSON: function (google_docs_id, deferred) {
      var _this = this;
      if (google_docs_id) {
        _this.opts.google_dodcs_id = google_docs_id;
      }
      var url = "https://spreadsheets.google.com/feeds/list/{google_docs_id}/od6/public/values?alt=json";

      url = url.replace("{google_docs_id}", google_docs_id);
      if (!google_docs_id ) {
        return false;
      }
      $.get(url, function(data){
         _this.entries = data.feed.entry;
         //paso el dererred porque el cálculo quizás
         // es asincrónico porque el usuario puede usar
         // texto para geocodificar en el campo recurso de la entry texto
         _this.GDocsJSON2PlainJSON();
         _this.parsePlainJSON(deferred);
      });
    },
    
    GDocsJSON2PlainJSON: function () {
      var _this = this;

      _this.opts.field_map = {
          titulo: "gsx$titulo",
          capa: "gsx$capa",
          recurso: "gsx$recurso",
          tiporecurso: "gsx$tiporecurso",
          zoom: "gsx$zoom",
          descripcion: "gsx$descripcion"
      };

      _this.entries = _this._mapFields(true);
    },

    parsePlainJSON: function(deferred) {
      var _this = this;

      var grupos = _this.entries.groupBy(function(item) {
        return item.tiporecurso;
      });

      _this.wms = grupos.wms;
      _this.marcadores = grupos.marcador;
      _this.kml = grupos.kml;

      if (grupos.centro !== undefined) {
        _this.parseCoordenadas(grupos.centro[0].recurso, function(latlng) {
          _this.opts.vistaInicial.lat = latlng.lat;
          _this.opts.vistaInicial.lng = latlng.lng;

          if (grupos.centro[0].zoom !== undefined) {
            _this.opts.vistaInicial.zoom = grupos.centro[0].zoom;  
          }

          if (grupos.centro[0].capa === 'satelite' ) {
            _this.opts.vistaInicial.capa = 'satellite';  
          }

          deferred.resolve();
          return deferred;    
        });
      } else {
        deferred.resolve();
      }
      
    },

    _mapFields: function(is_google_docs_json)
    {
      var _this = this;
      var field_map = _this.opts.field_map;
      var entries = [];
      /*
       * El JSON de un google docs, tiene la propiedad $t
       * en cada campo que tiene el valor del resultado.
       * así que lo manejo como un caso especial
       */

      if (is_google_docs_json) {
        entries = $.map(_this.entries, function(entry, i) {
          return {
            titulo: entry[field_map.titulo].$t,
            capa: entry[field_map.capa].$t,
            recurso: entry[field_map.recurso].$t,
            tiporecurso: entry[field_map.tiporecurso].$t,
            zoom: entry[field_map.zoom].$t,
            descripcion: entry[field_map.descripcion].$t
          };
        });
      } else {
        entries = $.map(_this.entries, function(entry, i) {
          return {
            titulo: entry[field_map.titulo],
            capa: entry[field_map.capa],
            recurso: entry[field_map.recurso],
            tiporecurso: entry[field_map.tiporecurso],
            zoom: entry[field_map.zoom],
            descripcion: entry[field_map.descripcion]
          };        

          _this.$el.data('entries', _this.entries);

        });
      }
      return entries;
    },

    magic: function () {
      var _this = this;

      $mapa = _this.$el;
      $mapa.argenmap();
      
      if (_this.opts.vistaInicial.zoom !== undefined) {
        $mapa.zoom( parseInt(_this.opts.vistaInicial.zoom) );      
      }

      if (_this.opts.vistaInicial.capa !== undefined) {
        $mapa.capaBase( _this.opts.vistaInicial.capa );      
      }

      if (_this.opts.vistaInicial.lat !== undefined) {
        $mapa.centro( _this.opts.vistaInicial.lat, _this.opts.vistaInicial.lng );      
      }

      $(_this.wms).each(function(k,capa) {
        $mapa.agregarCapaWMS({
          nombre: capa.titulo,
          capas: capa.capa,
          url: capa.recurso
        });
      });

      $(_this.marcadores).each(function(k, marcador) {
        _this.parseCoordenadas(marcador.recurso, function(latlng) {
          if (! latlng.lat ) {
            return;
          }
          var $contenido = $('<div />');
          $("<h3 />").html(marcador.titulo).appendTo($contenido);
          $("<div />").html(marcador.descripcion).appendTo($contenido);

          $mapa.agregarMarcador({
            nombre: marcador.titulo,
            icono: marcador.capa,
            lat: latlng.lat,
            lng: latlng.lng,
            contenido: $contenido.html(),
          });
        
        });

      });
      $(_this.kml).each(function(k, kml) {
        $mapa.agregarCapaKML({
          nombre: kml.titulo,
          url: 'http://mapa.ign.gob.ar/mapa/proxy/?url=' + encodeURIComponent(kml.recurso)
        });
      })
    },

    parseCoordenadas: function  (texto, callback, context) {
      var _this = this;
      var latlng = {
        lat: null,
        lng: null
      };
      if (texto.split(';').length === 2) {
        latlng.lat = texto.split(';')[0];
        latlng.lng = texto.split(';')[1];      
        callback(latlng);
      } else {
        _this.geoLocate(texto, function(latlng) {
          callback( latlng );
        });
      }
      
    },
    geoLocate: function( str, callback )
    {
      var _this = this,
        latlng = {
          lat:-34,
          lat:-59
        };
      $.getJSON('http://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + str, function(data) {
        if (! data.length) {
          return latlng;
        }
        if (callback) {
          callback({lat: data[0].lat , lng: data[0].lon});
        }
      });        
    },

    fitGeoLocateResult: function( d ) {
      var _this = this;
      var $mapa = _this.$el;
      s = d.boundingbox[0],
      w = d.boundingbox[2],
      n = d.boundingbox[1],
      e = d.boundingbox[3],
      southwest = new google.maps.LatLng(s,w),
      northeast = new google.maps.LatLng(n,w),
      boundingbox = new google.maps.LatLngBounds(southwest, northeast);

      $mapa.data().gmap.fitBounds( boundingbox);
    }    

  };

  // The actual plugin
  $.fn.argenmapvis = function(options) {
    if(this.length) {
      this.each(function() {
        var rev = new Argenmapvis(this, options);
        rev.init();
        $(this).data('argenmapvis', rev);
      });
    }
  };
})(jQuery);
