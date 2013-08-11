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
      },
      barra_class: '.barra',
      barra_titulo_class: '.titulo',
      barra_descripcion_class: '.descripcion'
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
      _this.$el.spin({width:5.5});
      $.when( _this.getDoc() ).done(function() {
          _this.magic();  
          _this.$el.spin(false);
      }).fail(function() {
        console.log('source inválido');
        _this.$el.spin(false);
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
      }).fail(function() {
        _this.alert('La hoja de cálculo no está publicada');
      });
    },
    
    GDocsJSON2PlainJSON: function () {
      var _this = this;

      /*
       * El JSON de un google docs, tiene la propiedad $t
       * en cada campo que tiene el valor del resultado.
       * así que lo manejo como un caso especial
       */
      _this.opts.field_map = {
          titulo: "gsx$titulo.$t",
          capa: "gsx$capa.$t",
          recurso: "gsx$recurso.$t",
          tiporecurso: "gsx$tiporecurso.$t",
          zoom: "gsx$zoom.$t",
          descripcion: "gsx$descripcion.$t"
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

          if (grupos.centro[0].capa === 'mapaignbyn' ) {
            _this.$el.addClass('argenmapvis_byn');
          }

          if (grupos.centro[0].titulo ) {
            $(_this.opts.barra_class).show();
            $(_this.opts.barra_class + ' ' + _this.opts.barra_titulo_class).html(grupos.centro[0].titulo);
          }          

          if (grupos.centro[0].descripcion ) {
            $(_this.opts.barra_class).show();
            $(_this.opts.barra_class + ' ' + _this.opts.barra_descripcion_class).html(grupos.centro[0].descripcion);
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

      entries = $.map(_this.entries, function(entry, i) {
        var mapped={};

        
        try {
          // Esto puede tirar error
          // si en la spreadsheet no están los encabezados
          mapped = magic_map(entry);
        } catch(e) {
          var url = 'https://docs.google.com/spreadsheet/pub?key={google_docs_id}&output=html';
          url = url.replace('{google_docs_id}', _this.opts.source);
          var msg = "Falta la línea de encabezados en la <a target='blank' href='{url}'>hoja de cálculo</a>";
          msg = msg.replace('{url}', url);
          _this.alert(msg);
        }
        return mapped;
      }); // fin del $.map
      
      function magic_map(entry)
      {
        var ret = {};
        $.each(field_map, function(name, real_name) {
          var tmp = entry;
          var partes = real_name.split('.');
          $(partes).each(function() {
            tmp = tmp[this];
          })
          ret[name] = tmp;

        });
        return ret;
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

    alert: function (msg) {
      var _this = this;
      $(_this.opts.barra_class).fadeIn();
      $(_this.opts.barra_class + ' ' + _this.opts.barra_titulo_class).html("argenWAMP - Error en el mapa");
      $(_this.opts.barra_class + ' ' + _this.opts.barra_descripcion_class).html(msg);
    },

    parseCoordenadas: function  (texto, callback, context) {
      var _this = this;
      var latlng = {
        lat: null,
        lng: null
      };

      if (_this.parseGeograficas(texto)) {
        var parsed = _this.parseGeograficas(texto);
        latlng.lat = parsed.lat.decimal;
        latlng.lng = parsed.lng.decimal;      
        callback(latlng);
      } else if ( _this.parseDMS(texto) ) {
        var parsed = _this.parseDMS(texto);
        latlng.lat = parsed.lat.decimal;
        latlng.lng = parsed.lng.decimal;      
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
    },

    parseDMS: function( pair ) {
      var tmpLat, tmpLng;
      
      var coord = {
        lat: {decimal:0, deg:0, min:0, sec:0},
        lng: {decimal:0, deg:0, min:0, sec:0}
      };
      // patrón que reconoce lat y longitud en grados, min, y segundos
      // con indicador de sentido de la latitud/longitud (S, N, O, E, o W)
      var pattern =  /[0-9]{1,3}[º°]{1}([0-9]{1,2}['′´]{1}){0,1}([0-9]{1,2}([.,]{1}[0-9]{1,}){0,1}["″¨]{1}){0,1}[sonew]{1}/gi;
      var matches = pair.match(pattern);
      
      // si no hay matches o se encuentra más de UN
      // PAR de coordenadas, no lo proceso como válido
      if (!matches || matches.length > 2 ) {
        return false;
      }
      
      for (var i=0; i<matches.length;i++) {
        var decimal,
          //traigo los grados
          deg = matches[i].match(/[0-9]{1,3}[º°]{1}/g),
          //traigo los minutos
          min = matches[i].match(/[0-9]{1,2}['′´]{1}/g),
          //traigo los segundos
          sec = matches[i].match(/[0-9]{1,2}([.,]{1}[0-9]{1,}){0,1}["″¨]{1}/g),
        
          // dec(linación)(fruta el nombre de la variable).
          // Esto marca si la coordenada parseada es latitud sur o norte
          // o longitud este u oeste.
          dec = matches[i].match(/[sonew]/gi);
        dec = dec[0].toLowerCase();
        
        // esto es porque quizás las coordenadas
        // no tienen min o seg
        deg = $.isArray(deg) ? deg[0] : '';
        min = $.isArray(min) ? min[0] : '';
        sec = $.isArray(sec) ? sec[0] : '';
        
        deg = parseFloat ( deg.replace(',', '.') ) || 0;
        min = parseFloat ( min.replace(',', '.') ) || 0;
        sec = parseFloat ( sec.replace(',', '.') ) || 0;
          
        decimal = deg+ (min/60) + (sec/3600);
          //si es latitud
        if (dec == "s" || dec == "n" ) {
          coord.lat.deg = deg;
          coord.lat.min = min;
          coord.lat.sec = sec;
          coord.lat.decimal = decimal
          // si es latitud negativa
          if ( dec == "s" ) {
            coord.lat.decimal *= -1;
          }
        }
          //si es longitud negativa
        if (dec == "o" || dec == "w" || dec == "e" ) {
          coord.lng.deg = deg;
          coord.lng.min = min;
          coord.lng.sec = sec;          
          coord.lng.decimal = decimal
          // si es latitud negativa
          if ( dec == "o" || dec == "w" ) {
            coord.lng.decimal *= -1;
          }
        }       
      }
      return coord;
    },

    /**
     * Parsea una cadena de texto en búsqueda
     * de coordenadas del tipo lat lng. Es decir
     * solo devuelve las coordenadas parseadas si la cadena contiene
     * un solo par de coordenadas o una sola coordenada.
     * 
     * -El separador decimal es el punto o la coma "." o "," 
     * -El signo "-" se interpreta como indicador de coordenadsa negativas
     * -Las coordenadas positivas no deben tener el signo "+" precedente.
     * Cadenas válidas
     *  32.12 65.32
     *  32,12 65,32
     *  -54.12 65,12 o -54,12 65.12 
     *  -55.23 o -55,23
     *  42.23
     *  
     *  @param string pair: la cadena de texto con el par de coordenadas
     *  en formato "lat lng"
     */
    parseGeograficas: function(pair) {
      var tmpLat, tmpLng;
      
      var coord = {
        lat: {decimal:0, deg:0, min:0, sec:0},
        lng: {decimal:0, deg:0, min:0, sec:0}
      };

      var pattern =  /-{0,1}[0-9]{1,3}([.,]{1}[0-9]{1,}){0,1}/g;
      
      var matches = pair.match(pattern);
      // si no hay matches o se encuentra más de UN
      // PAR de coordenadas, no lo proceso como válido
      if (!matches || matches.length > 2 ) {
        return false;
      }
      //reemplazo las comas por puntos para poder castear bien
      tmpLat = parseFloat ( matches[0].replace(',', '.') );
      // Latitud tiene que estar dentro del rango [-90,90]
      // De lo contrario, directamente devuelvo false
      // con longitud hago el mismo chequeo pero no devuelvo false
      // si 
      if (tmpLat > 90 || tmpLat < -90) {
        return false;
      }
      coord.lat.decimal = tmpLat;
      if ( matches.length > 1 ) {
        //reemplazo las comas por puntos para poder castear bien
        tmpLng = parseFloat ( matches[1].replace(',', '.') );
        // Longitud tiene que estar dentro del rango [-180,180]
        // De lo contrario, seteo lng en false;
        // No vuelvo porque la latitud tiene que estar bien si llegué
        // a este punto
        if (tmpLng > 180 || tmpLng < -180) {
          coord.lng.decimal = undefined;
        } else {
          coord.lng.decimal = tmpLng
        }
      }
      return coord;
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
