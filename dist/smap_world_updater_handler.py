"""
PODPAC-DROUGHT-MONITOR SMAP-DATA-UPDATER AWS Handler
"""

import sys
import os
import subprocess

import boto3
import botocore
from multiprocessing.pool import ThreadPool


from six import string_types

def handler(event, context, source=None):
    """Lambda function handler
    
    Parameters
    ----------
    event : dict
        Description
    context : TYPE
        Description
    """
    print(event)
    
    sys.path.append("/tmp/")
    bucket = 'podpac-drought-monitor-s3'

    # get dependencies path
    if "FUNCTION_DEPENDENCIES_KEY" in os.environ:
        dependencies = os.environ["FUNCTION_DEPENDENCIES_KEY"]
    else:
        dependencies = "podpac_deps_{}.zip".format(
            os.environ.get("PODPAC_VERSION", '2.0.0')
        )  # this should be equivalent to version.semver()

    # Download dependencies from specific bucket/object
    if os.path.exists("/tmp/scipy"):
        print (
            "Scipy has been detected in the /tmp/ directory. Assuming this function is hot, dependencies will"
            " not be downloaded."
        )
    elif event:
        print ("Downloading and extracting dependencies")
        s3 = boto3.client("s3")
        s3.download_file(bucket, dependencies, "/tmp/" + dependencies)
        subprocess.call(["unzip", "/tmp/" + dependencies, "-d", "/tmp"])
        sys.path.append("/tmp/")
        subprocess.call(["rm", "/tmp/" + dependencies])
    
    
    import matplotlib

    matplotlib.use("agg")
    import datetime
    import podpac
    import xarray as xr
    import zarr
    import numpy as np

    from podpac import settings
    import podpac.datalib
    from podpac.datalib import smap_egi
    
    
    bucket = "podpac-drought-monitor-s3"
    if source is None:
        source = 's3://%s/%s' % (bucket, 'SMAP_CHUNKED32.zarr')
    
    tmpzarr = '/tmp/UPD.zarr'    

    # AM/PM Data
    print("Opening L3 Zarr dataset.")
    smap_zarr = podpac.data.Zarr(
        source=source,
        time_key='time',
        data_key='Soil_Moisture_Retrieval_Data_AM/soil_moisture',
        lat_key='lat',
        lon_key='lon',
        crs='EPSG:4326',
        nan_vals=[-9999],
        skip_validation=True,
        file_mode='a'
    )
    smap_ds = smap_zarr.dataset

    print("Creating L3 Coordinates")
    coords = smap_zarr.coordinates.drop('time')
    time = podpac.crange(smap_zarr.coordinates['time'].bounds[-1], str(datetime.date.today()), '1,D', 'time')
    coords = podpac.coordinates.merge_dims([coords, podpac.Coordinates([time], crs=coords.crs)]).transpose(*smap_zarr.dims)

    # Create the local zarr file and download the relevant chunks
    zf = zarr.open(tmpzarr, 'a')

    available_data_keys = [
        'Soil_Moisture_Retrieval_Data_AM/soil_moisture',
        'Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag',
#        'Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm',
#        'Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm',
            ]


    for k in available_data_keys:
        zf.create_dataset(k, shape=smap_ds[k].shape, chunks=smap_ds[k].chunks, dtype=smap_ds[k].dtype, overwrite=True)
    zf['time'] = smap_ds['time']
    chunks = smap_ds[k].chunks
    shape = smap_ds[k].shape
    shape = shape[:2] + (smap_ds['time'].shape[0] + 1, )
    parts = [[i for i in range(int(np.ceil(shape[ii] / chunks[ii])))] for ii in range(3)]
    files = ['{}.{}.{}'.format(i, j, parts[2][-1]) for i in parts[0] for j in parts[1]]
    files.append('.zarray') 

    print ('Downloading chunks that need updating locally in a separate thread')
    def download_files(src_root, dst_root, up=False):
        for f in files:
            for k in available_data_keys:
                src = '{}/{}/{}'.format(src_root, k, f)
                dst = '{}/{}/{}'.format(dst_root, k, f)
                if up:
                    smap_zarr.s3.put(src, dst)
                else:
                    try:
                        smap_zarr.s3.download(src, dst)
                    except trFileNotFoundError:
                        pass
   
    up_pool = ThreadPool(1)
    r_up = up_pool.apply_async(download_files, (smap_zarr.source, tmpzarr))

    print("Downloading the new L3 Data")
    count = 0
    for c in coords.iterchunks(coords.shape[:-1] + (1, )): 
        count += 1                                                 
        if count == 1: continue  # Start is already in the dataset
        print("Download L3 Data for:", str(c['time']), '...', end='')
        try:
            # AM Data
            print("AM", end=' ')
            smap = smap_egi.SMAP(product='SPL3SMP_E_AM', check_quality_flags=False)
            l3_am = smap.eval(c)
            smap.set_trait('data_key', smap.quality_flag_key)
            smap.update_cache = True
            print("AM_QF", end=' ')
            l3_am_qf = smap.eval(c)

            # PM Data
            # print("PM", end=' ')
            # smap = smap_egi.SMAP(product='SPL3SMP_E_PM', check_quality_flags=False)
            # l3_pm = smap.eval(c)
            # smap.set_trait('data_key', smap.quality_flag_key)
            # smap.update_cache = True
            # print("PM_QF", end=' ')
            # l3_pm_qf = smap.eval(c)
        except ValueError as e:
            print("No Granules available:", e)
            continue

        # replace_nans
        l3_am.set(-9999, podpac.UnitsDataArray(np.isnan(l3_am)))
        l3_am_qf.set(-9999, podpac.UnitsDataArray(np.isnan(l3_am_qf)))
        # l3_pm.set(-9999, podpac.UnitsDataArray(np.isnan(l3_pm)))
        # l3_pm_qf.set(-9999, podpac.UnitsDataArray(np.isnan(l3_pm_qf)))

        print(" ... Done.")
        new_times = c.coords['time'] 
        print("Waiting for local chunks to download...", end='')
        up_pool.close()
        up_pool.join()
        r_up.get()
        print(" ... Done.")
         
        for i, nt in enumerate(new_times):
            if np.any((smap_ds['time'][:] - nt).astype(int) >= 0) or np.all(l3_am[..., i] == -9999): # or np.all(l3_pm[..., i] == -9999):
                print('Time already exists, or is all nan -- skipping.')
                continue

            print("Updating S3 Zarr file for L3 Data.")
            old_time_shape = zf['time'].shape
            old_data_shape = zf[available_data_keys[0]].shape
            expected_data_shape = old_data_shape[:2] + old_time_shape
            
            # Make sure the starting sizes are all the same
            print ('Ensuring starting sizes are the same')
            zf['time'].resize(*old_time_shape)
            zf['Soil_Moisture_Retrieval_Data_AM/soil_moisture'].resize(*expected_data_shape)
            zf['Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag'].resize(*expected_data_shape)
            # zf['Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm'].resize(*expected_data_shape)
            # zf['Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm'].resize(*expected_data_shape)            

            print ('Old Shape:', expected_data_shape)
            try:
                def f(key, data):
                    zf[key].append(data, axis=2)
                    return True
                    
                # Update the zarr file
                ## IMPORTANT ONLY EXECUTE THIS CELL ONCE!!!! ANY ERRORS? DO NOT EXECUTE THE SAME APPEND AGAIN!
                f('Soil_Moisture_Retrieval_Data_AM/soil_moisture', l3_am[..., i:i+1])
                f('Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag', l3_am_qf[..., i:i+1])
                # f('Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm', l3_pm[..., i:i+1])
                # f('Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm', l3_pm_qf[..., i:i+1])
                print("Uploading local chunks")
                #files = os.path.listdir(tmpzarr)
                download_files(tmpzarr, smap_zarr.source, True)
                print("Updating time as final step")
                smap_ds['time'].append(np.atleast_1d(nt))
                zf['time'].append(np.atleast_1d(nt))
            except Exception as e:
                print ('Updating L3 data failed:', e)
                smap_ds['time'].resize(*old_time_shape)
                smap_ds['Soil_Moisture_Retrieval_Data_AM/soil_moisture'].resize(*expected_data_shape)
                smap_ds['Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag'].resize(*expected_data_shape)
                # smap_ds['Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm'].resize(*expected_data_shape)
                # smap_ds['Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm'].resize(*expected_data_shape)
            print ('New Shape:', smap_ds['Soil_Moisture_Retrieval_Data_AM/soil_moisture'].shape)
        zarr.consolidate_metadata(smap_zarr._get_store())
        print("Done!")
        # break  # only do 1 loop
    return

if __name__ == '__main__':
    handler(None, None)#, source=r'C:\SMAP2.zarr')
    print('Done')
