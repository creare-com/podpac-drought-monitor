from matplotlib.pylab import *


# In[2]:


import podpac
from podpac import Node
from podpac import alglib
import traitlets as tl
import logging
import time
import inspect
logger = logging.getLogger('podpac')
logger.setLevel(logging.INFO)


# In[3]:


from podpac.utils import create_logfile


# In[4]:


create_logfile(r'D:\smap_cats_compute.log')


# In[5]:


settings = {
    "FUNCTION_NAME": "podpac-drought-monitor-lambda-compute-stats",
    "S3_BUCKET_NAME": "podpac-drought-monitor-s3",
    "FUNCTION_ROLE_NAME": "podpac-drought-monitor-role",
    "MULTITHREADING": True,
    "N_THREADS": 64,
    "AWS_ACCESS_KEY_ID": podpac.settings["AWS_ACCESS_KEY_ID"],
    "AWS_SECRET_ACCESS_KEY": podpac.settings["AWS_SECRET_ACCESS_KEY"],
    "AWS_REGION_NAME": podpac.settings["AWS_REGION_NAME"],
    "AWS_BUDGET_AMOUNT": 100,
    "AWS_BUDGET_EMAIL": podpac.settings["AWS_BUDGET_EMAIL"],
    "FUNCTION_DEPENDENCIES_KEY": "podpac_deps.zip",
}
podpac.settings.update(settings)
# settings


# In[6]:


N_WORKERS = 30


# In[7]:


node = podpac.data.Zarr(
    source='s3://podpac-drought-monitor-s3/SMAP.zarr',
    time_key='time',
    data_key='Soil_Moisture_Retrieval_Data_AM/soil_moisture',
    lat_key='lat',
    lon_key='lon',
    nan_vals=[-9999],
    skip_validation=True,
)
# node


# In[8]:


node_poros = podpac.data.Zarr(
    source=r's3://podpac-drought-monitor-s3/SMAP_PROPS.zarr',
    data_key='Land-Model-Constants_Data/clsm_poros',
    lat_key='lat',
    lon_key='lon',
    nan_vals=[-9999],
    skip_validation=True
)
# node_poros


# In[9]:


sb = alglib.climatology.BetaFitDayOfYear(source=node, percentiles=[0.3, 0.2, 0.1, 0.05, 0.02], window=44, scale_max=node_poros,
                                         scale_float=[0, 1])


# In[10]:


coords_mp = node.native_coordinates#.select({"lat": [], "lon": []})
coords_mp


# In[11]:


node_p = podpac.managers.Lambda(
    source=sb,
    eval_settings=settings,
    eval_timeout=1.25
)


# In[12]:


node_mp = podpac.core.managers.parallel.ParallelAsyncOutputZarr(
    source=node_p, 
    number_of_workers=N_WORKERS,
    chunks={'lat': 8, 'lon': 8},
    zarr_file=r's3://podpac-drought-monitor-s3/SMAP_CATS_2.zarr', init_file_mode='a',
    zarr_chunks={'lat': 8, 'lon': 8, 'time': 128},
    zarr_shape={'lat': coords_mp['lat'].size, 'lon': coords_mp['lon'].size, 'time': 366},
    zarr_coordinates=podpac.Coordinates([podpac.crange(1, 366, 1, 'time')]),
    skip_existing=False,
    aws_config_kwargs=dict(max_pool_connections=N_WORKERS*10),  # This is needed to avoid a warning about the number of open connections
    start_i = 0  # I was developing the software as I was doing this computation, so I made improvements along the way and did not want to start over
)
node_mp


# In[ ]:


time.sleep(3600*2)
o_mp = node_mp.eval(coords_mp)


# In[ ]:


# Check the results
cats = podpac.data.Zarr(
    source=r's3://podpac-drought-monitor-s3/SMAP_CATS.zarr',
)
cats


# In[ ]:


d0 = cats.dataset['d0'][:, :, 128]
matshow(d0)
show()

