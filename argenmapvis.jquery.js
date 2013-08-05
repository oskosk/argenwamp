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
        zoom: undefined
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
      $.when(
        _this.getDoc()
      ).done(function() {
        $.when(
          _this.parseGDoc()
        ).done(function() {
          _this.magic();  
          
        });
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
      if (! valid_url ) {
        //si no es una url válida, 
        _this.getGoogleDocsJSON(source, deferred);
      } else {
        deferred.fail();
      }
      
      return deferred.promise();      
    },

    getGoogleDocsJSON: function (google_docs_id, deferred) {
      var _this = this;
      if (google_docs_id) {
        _this.opts.google_dodcs_id = google_docs_id;
      }
      var url = "https://spreadsheets.google.com/feeds/list/{google_docs_id}/od6/public/values?alt=json";

      url = url.replace("{google_docs_id}", google_docs_id);
      if (!google_docs_id ) {
        console.log('Se necesita el parámetro source en la URL');
        return false;
      }
      $.get(url, function(data){
         _this.entries = data.feed.entry;
         deferred.resolve(data);
      });
    },

    parseGDoc: function () {
      var _this = this;
      var deferred = $.Deferred();    

      var field_map = {
          titulo: "gsx$titulo",
          capa: "gsx$capa",
          recurso: "gsx$recurso",
          tiporecurso: "gsx$tiporecurso",
          zoom: "gsx$zoom",
          descripcion: "gsx$descripcion"
      };

      //mapeo del formato de google docs json al json
      // que necesito (coincide con el mismo que se acepta
      // si source es una url de un json)
      _this.entries = $.map(_this.entries, function(entry, i) {
        return {
          titulo: entry[field_map.titulo].$t,
          capa: entry[field_map.capa].$t,
          recurso: entry[field_map.recurso].$t,
          tiporecurso: entry[field_map.tiporecurso].$t,
          zoom: entry[field_map.zoom].$t,
          descripcion: entry[field_map.descripcion].$t
        };

        _this.$el.data('entries', _this.entries);

      });

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
          deferred.resolve();
        });
      }
      return deferred;    
    },

    magic: function () {
      var _this = this;

      $mapa = _this.$el;
      $mapa.argenmap();
      
      if (_this.opts.vistaInicial.zoom !== undefined) {
        $mapa.zoom( parseInt(_this.opts.vistaInicial.zoom) );      
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
